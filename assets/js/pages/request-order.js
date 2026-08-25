// Request Order Page (下單系統)

const requestOrderState = {
  series: 'All',            // legacy (unused since Category tabs replaced Series tabs — kept for back-compat)
  categoryTab: 'All',       // active Category tab (Part 2 — source: sku_details.category)
  showMode: 'all',
  filters: {
    country: [],
    marketplace: [],
    risk: [],               // placeholder filter (no risk engine yet — see Mapping v1 spec)
    category: [],           // legacy (Category is now a tab, not a filter)
    sku: '',
    dateRange: null
  },
  data: [],
  // F1-7M-UX explicit-Search gate: normal result rows render ONLY after the user presses Search. Flips true in
  // handleRequestOrderSearch; false on a Country/Marketplace/Clear scope change. Filters / Category counts / alert
  // hooks are NOT gated by this (they render independently).
  searched: false,
  expandedRowKey: null,   // composite row identity: sku|company|country|marketplace (NOT sku-only —
                          // so CO1100-R/US/Amazon and CO1100-R/CA/Amazon expand independently)
  // Pagination (Mapping v2 Part 1). Filtering + category tab apply BEFORE pagination; page resets
  // to 1 on Search / filter / tab / show-mode change. Never render all rows at once.
  page: 1,
  pageSize: 50,        // Part 5: max 50 rows per page
  confirmedSites: [],  // Site-confirmation records (frontend placeholder only — no DB write in v1)
  allocEdits: {}       // Order Allocation edits keyed by sku|country|marketplace → { T1, T2, T3, note }
};

// ---- Data source detection (Request Order Mapping v1) ----
// Live DB (google-sheet) is the authoritative source. Demo Data is the fallback for local preview.
// The page NEVER reads the Inventory Replenishment DOM.
function _roUseDb() {
  // F1-7M-B2-HOTFIX (Shape-2 cold-start): cloud eligibility INDEPENDENT of whether the broad _opDbCache has been primed
  // (F1-7L zero-prime). Order Planning's canonical first-layer is the scoped 56_ composer (getAiPlanFirstLayer) + the
  // bounded marketplace reference — neither needs _opDbCache. The former getDataSourceMode()==='google-sheet' test was
  // false on a cold session (cache not startup-primed), so initRequestOrderSection wrongly skipped the composer and
  // rendered "No Request Order data available…". Broad KM.DB.get*() getters stay null-safe ([] until their scoped loaders
  // run), so this only OPENS the canonical path — it does not read an unprimed cache. Explicit mock / unconfigured API →
  // isScopedReadEligible() false → Demo/empty branch preserved (no accidental production API call).
  return !!(window.KM && window.KM.DB && typeof window.KM.DB.isScopedReadEligible === 'function' &&
    window.KM.DB.isScopedReadEligible() && window.KM.DB.getMarketplaceSkus);
}

// F1-7L: the SECOND-LAYER expand panel + the Send path read these facts (FC regular/special/target, factory
// stock, warehouses, PO headers/lines) via the broad KM.DB.get*() getters. Instead of the retired whole-DB
// startup prime (or the old expand-time whole-DB self-load), load ONLY these tables via the bounded scoped
// getTable path (KM.DB.refreshCacheTables) — the SAME normalizer the broad getters use, so every second-layer
// fact stays BEFORE==AFTER. Once per page load (guard); force=true re-reads after a second-layer FC/Target write.
var _RO_L2_TABLES = ['fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'factory_stock', 'warehouses', 'purchase_orders', 'purchase_order_lines'];
var _roL2Ready = false;
function _roEnsureL2Tables(force) {
  if (!_roUseDb() || !(window.KM && window.KM.DB && typeof window.KM.DB.refreshCacheTables === 'function')) return Promise.resolve();
  if (_roL2Ready && !force) return Promise.resolve();
  return window.KM.DB.refreshCacheTables(_RO_L2_TABLES).then(function () { _roL2Ready = true; }).catch(function () {});
}

// Small helpers.
function _roEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _roDistinct(arr) {
  var seen = {}, out = [];
  (arr || []).forEach(function(v) { v = String(v == null ? '' : v).trim(); if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
  return out.sort();
}
// Render helper: null / undefined → "--" placeholder; numbers → localized; strings verbatim.
function _roFmt(v) {
  if (v == null) return '--';
  return (typeof v === 'number') ? v.toLocaleString() : String(v);
}

// ---- Runtime month helper (Mapping v2) ----
var RO_MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
// Current wall-clock date in Asia/Taipei (canonical timezone for month windows — spec Shared rule F.1).
// Falls back to browser-local time only if Intl/timeZone is unavailable.
function _roTpeNow() {
  try {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
    var y, m, d;
    parts.forEach(function(p) { if (p.type === 'year') y = parseInt(p.value, 10); else if (p.type === 'month') m = parseInt(p.value, 10); else if (p.type === 'day') d = parseInt(p.value, 10); });
    if (y && m) return { year: y, monthIdx: m - 1, day: d || 1 };
  } catch (e) { /* fall through */ }
  var dd = new Date();
  return { year: dd.getFullYear(), monthIdx: dd.getMonth(), day: dd.getDate() };
}
// `count` consecutive months starting `startOffset` months from the current Asia/Taipei month
// (0 = current month, 1 = next month, -1 = last month). Handles year wrap. → [{ key, year, idx, label }].
function _roMonthWindow(startOffset, count) {
  var now = _roTpeNow(), y = now.year, m = now.monthIdx, out = [];
  for (var i = 0; i < count; i++) {
    var mm = m + startOffset + i;
    var yy = y + Math.floor(mm / 12);
    var idx = ((mm % 12) + 12) % 12;
    out.push({ key: RO_MONTH_KEYS[idx], year: yy, idx: idx, label: (idx + 1) + '/' + yy });
  }
  return out;
}
// Next N calendar months AFTER the current month (N+1..N+N) → [{ key, year, idx, label }].
function _roNextMonths(n) { return _roMonthWindow(1, n); }
// Past N calendar months BEFORE the current month → [{ key, year, idx, label }].
function _roPastMonths(n) { return _roMonthWindow(-n, n); }
function _roUpper(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function _roLower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
// Composite row identity — sku + company + country + marketplace (company may be '' → still unique per
// site). Fixes the SKU-only expand bug where same-SKU rows on different sites expanded together.
function _roRowKey(item) {
  return [item.sku || '', item.company != null ? item.company : '', item.country || '', item.marketplace || ''].join('|');
}
// Stable DOM id for a row's second-layer panel (aria-controls target). Row keys carry '|' and free text,
// so sanitize to id-safe characters.
function _roPanelId(rowKey) { return 'ro-expand-' + String(rowKey == null ? '' : rowKey).replace(/[^A-Za-z0-9_-]/g, '-'); }
// Escape a value for embedding inside a single-quoted JS string in an inline onclick handler.
function _roJs(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function _roIsActiveFlag(v) { var s = _roLower(v); return s === 'active' || s === 'true' || s === 'yes' || s === '1'; }

// ===== Recommendation display helpers (2026-07-24) — DISPLAY ONLY. These do NOT compute any canonical
// forecast/T1–T3/FC-Share/Recommended value; they format carton breakdowns and READ the per-tier gap the
// canonical engine (KM.utils.forecastEngine) already produced. No new formula.
// NOTE (2026-07-24 cleanup): Aging / Day-of-Supply display was REMOVED from Request Order — that concern
// lives on the Inventory Replenishment / 貨物庫存表 page (its canonical helpers). Request Order no longer
// renders DOS/90+/180+ nor fetches amazon_inventory_health_snapshot for UI. =====

// Carton breakdown for a manual Order Qty. isPartial = not an exact carton multiple (non-blocking).
// isValid=false only for negative / non-numeric (blocking). box=0 ⇒ carton unknown (treat as valid, no split).
function _roCartonBreak(orderQty, box) {
  var q = (orderQty === '' || orderQty == null) ? NaN : Number(orderQty);
  var b = parseFloat(box) || 0;
  if (isNaN(q)) return { isNumeric: false, isValid: false, isPartial: false, full: 0, loose: 0 };
  if (q < 0) return { isNumeric: true, isValid: false, isPartial: false, full: 0, loose: 0, qty: q };
  if (b <= 0) return { isNumeric: true, isValid: true, isPartial: false, full: null, loose: null, qty: q, boxUnknown: true };
  var full = Math.floor(q / b), loose = q - full * b;
  return { isNumeric: true, isValid: true, isPartial: loose !== 0, full: full, loose: loose, qty: q, box: b };
}
// Per-tier canonical gap (Recommended Qty) — reads the engine's per-tier balance; NEVER sums tiers.
// idx 0/1/2 = T1/T2/T3. Returns null when the canonical calc is absent (live-DB placeholder rows) → "--".
function _roTierBalance(item, idx) {
  var arr = [item.shortageM1, item.shortageM2, item.shortageM3];
  var s = arr[idx];
  return (typeof s === 'number' && isFinite(s)) ? s : null;
}
function _roTierRecommended(item, idx) { var s = _roTierBalance(item, idx); if (s == null) return null; return s < 0 ? Math.abs(s) : 0; }
// Suggested Qty = Recommended Qty rounded UP to a full carton multiple (canonical rounding; unchanged).
function _roTierSuggested(item, idx) {
  var rec = _roTierRecommended(item, idx); if (rec == null) return null;
  var box = parseFloat(item.boxSize) || 0;
  return (box > 0 && rec > 0) ? Math.ceil(rec / box) * box : rec;
}
// Effective Order Qty = explicit user edit if present, else default to Suggested Qty (G/J.4).
function _roEffectiveOrderQty(item, idx, edit) {
  if (edit && edit.orderQty != null && edit.orderQty !== '') return Number(edit.orderQty);
  var sug = _roTierSuggested(item, idx);
  return (sug == null) ? null : sug;
}
// First Shortage Tier = the FIRST tier whose projected balance is negative (Risk driver). null = none.
function _roFirstShortageTier(item) {
  for (var i = 0; i < 3; i++) { var s = _roTierBalance(item, i); if (s != null && s < 0) return i; }
  return null;
}
var RO_TIER_LABELS = ['T1', 'T2', 'T3'];

// Open PO statuses that still contribute to Ongoing Orders (Part 5). Excludes draft / completed /
// closure / cancelled / (fully) shipped. `confirmed` / `ready_to_ship` are legacy-open.
var RO_OPEN_PO_STATUS = { issued: 1, in_production: 1, partial_completed: 1, partial_shipped: 1, ready_to_ship: 1, confirmed: 1 };

// ---- Shared second-layer data helpers (2026-07-23 data-connection) ----
// Internal YYYY-MM key from a month descriptor {year, idx(0-based)}.
function _roYmKey(mo) { return mo.year + '-' + String(mo.idx + 1).padStart(2, '0'); }
// Parse a date string to a UTC Date (handles YYYY-MM-DD / YYYY/MM/DD and any Date-parseable string). null if invalid.
function _roParseDate(s) {
  s = String(s == null ? '' : s).trim(); if (!s) return null;
  var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  var t = Date.parse(s); return isNaN(t) ? null : new Date(t);
}
// Resolve the full Request Order row (incl. company/series/category) for a scope triple.
function _roFindItem(sku, country, marketplace) {
  var rows = (typeof requestOrderState !== 'undefined' && requestOrderState.data) || [];
  return rows.filter(function(it) {
    return _roUpper(it.sku) === _roUpper(sku) && _roUpper(it.country || '') === _roUpper(country || '') && _roLower(it.marketplace || '') === _roLower(marketplace || '');
  })[0] || { sku: sku, country: country || '', marketplace: marketplace || '', company: '', series: '', category: '' };
}

// Special-event scope + status filter (blank status → treated as ACTIVE, since the live fc_special_events
// header may not yet carry `status` — FC_SUMMARY_SPEC §pending). Canonical: SUPPLY_PLANNING_CALCULATION_RULES.
var _RO_EVT_DEAD_SET = { inactive: 1, deleted: 1, archived: 1, cancelled: 1, void: 1 };
function _roEventScopeMatch(e, scope) {
  var skuMatch = _roUpper(e.sku) === _roUpper(scope.sku) || (e.scopeType === 'sku' && _roUpper(e.scopeId) === _roUpper(scope.sku));
  if (!skuMatch) return false;
  if (e.company && scope.company && _roUpper(e.company) !== _roUpper(scope.company)) return false;
  if (e.country && scope.country && _roUpper(e.country) !== _roUpper(scope.country)) return false;
  if (e.marketplace && scope.marketplace && _roLower(e.marketplace) !== _roLower(scope.marketplace)) return false;
  var st = _roLower(e.status);
  if (st && _RO_EVT_DEAD_SET[st]) return false;
  return true;
}
function _roScopedActiveEvents(scope) {
  var DB = (window.KM && window.KM.DB) || {};
  return ((DB.getFcSpecialEvents && DB.getFcSpecialEvents()) || []).filter(function(e) { return _roEventScopeMatch(e, scope); });
}
// Canonical: Event Preparation Date = Event Start Date − 30 calendar days; the event is bucketed into the
// month CONTAINING the preparation date (SUPPLY_PLANNING_CALCULATION_RULES §canonical). null if no start date.
function _roEventPrepMonth(e) {
  var dt = _roParseDate(e.eventStartDate);
  if (!dt) return null;
  var prep = new Date(dt.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { year: prep.getUTCFullYear(), idx: prep.getUTCMonth(), prepDate: prep.toISOString().slice(0, 10) };
}
function _roEventsForPrepMonth(events, mo) {
  var list = [];
  events.forEach(function(e) {
    var pm = _roEventPrepMonth(e); if (!pm || pm.year !== mo.year || pm.idx !== mo.idx) return;
    list.push({ name: String(e.event || e.eventName || 'Event'), qty: (parseFloat(e.fcQty) || 0), start: e.eventStartDate || '', prep: pm.prepDate, status: e.status || '', source: (e.raw && e.raw.source) || '' });
  });
  list.sort(function(a, b) { return String(a.name).localeCompare(String(b.name)); });
  return list;
}
// First-layer 3-month total = Σ FC Qty of scoped active events whose PREPARATION-DATE month is in N+1..N+3.
// Special events are ALWAYS 100% (never multiplied by Target%), each event counted once. Returns null when
// the SKU has no scoped events at all, 0 when it has events but none fall in the window.
function _roSpecialEventsTotal(scope) {
  var events = _roScopedActiveEvents(scope);
  if (!events.length) return null;
  var keys = {}; _roNextMonths(3).forEach(function(mo) { keys[_roYmKey(mo)] = 1; });
  var total = 0;
  events.forEach(function(e) {
    var pm = _roEventPrepMonth(e); if (!pm) return;
    if (!keys[pm.year + '-' + String(pm.idx + 1).padStart(2, '0')]) return;
    total += (parseFloat(e.fcQty) || 0);
  });
  return total;
}

// Factory Orders / In-Production from PO header ⋈ line. Bucket by LINE expected_completion_date, else
// HEADER expected_completion_date (never created_at/order_date). Exclude cancelled/closure headers.
// Returns { 'YYYY-MM': { scheduled, completed } } where scheduled = MAX(ordered_qty − completed_qty, 0)
// (production still outstanding — NOT the stored remaining_qty which is available-to-ship). Each line once.
function _roFactoryOrdersBySku(sku) {
  var DB = (window.KM && window.KM.DB) || {};
  var lines = (DB.getPurchaseOrderLines && DB.getPurchaseOrderLines()) || [];
  var pos = (DB.getPurchaseOrders && DB.getPurchaseOrders()) || [];
  var poById = {}; pos.forEach(function(p) { poById[p.purchaseOrderId] = p; });
  var byKey = {};
  lines.forEach(function(l) {
    if (_roUpper(l.sku) !== _roUpper(sku)) return;
    var po = poById[l.purchaseOrderId];
    var st = po ? _roLower(po.status) : '';
    if (st === 'cancelled' || st === 'closure' || st === 'closed') return; // not valid future supply
    var dstr = l.expectedCompletionDate || (po ? po.expectedCompletionDate : '') || '';
    var dt = _roParseDate(dstr);
    if (!dt) return; // no completion date → cannot bucket to a month
    var key = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
    var ordered = parseFloat(l.orderedQty) || 0, completed = parseFloat(l.completedQty) || 0;
    if (!byKey[key]) byKey[key] = { scheduled: 0, completed: 0 };
    byKey[key].scheduled += Math.max(0, ordered - completed);
    byKey[key].completed += completed;
  });
  return byKey;
}

// Build Request Order rows from NORMALIZED DB data (Mapping v2). Row identity = SKU + Country +
// Marketplace (marketplace_skus). Category / Series ← sku_details. REAL source mapping for:
//   Basic(T3)      = Σ fc_regular_forecast next-3-months (by sku+country+marketplace, per year)
//   Site Stock     = latest amazon_inventory_snapshot (available + fc_transfer + fc_processing)
//   3rd Party      = Σ overseas_inventory_snapshot.available_stock (same-country non-factory WH)
//   Factory Stock  = Σ factory_stock.current_stock per SKU (across factory warehouses)
//   Ongoing Orders = Σ open-PO remaining_qty per SKU (purchase_order_lines ⋈ purchase_orders.status)
//   Lead Time      = supplier_price_list.lead_time_days (active row, latest effective_from)
// Risk / Remaining / Suggested Order stay placeholders (null → "--"; no formula). Missing source → null.
function _buildRequestOrderRowsFromDb() {
  if (!_roUseDb()) return [];
  var mskus = window.KM.DB.getMarketplaceSkus() || [];
  if (!mskus.length) return [];
  var DB = window.KM.DB;

  var details = (DB.getSkuDetails && DB.getSkuDetails()) || [];
  var detailBySku = {};
  details.forEach(function(d) { detailBySku[d.sku] = d; });

  // fc_regular_forecast indexed by sku|country|marketplace → rows (one per year).
  var fc = (DB.getFcRegularForecast && DB.getFcRegularForecast()) || [];
  var fcByKey = {};
  fc.forEach(function(r) {
    var k = _roUpper(r.sku) + '|' + _roUpper(r.country) + '|' + _roLower(r.marketplace);
    (fcByKey[k] = fcByKey[k] || []).push(r);
  });

  // amazon_inventory_snapshot indexed by sku (site/platform stock).
  var amz = (DB.getAmazonInventorySnapshot && DB.getAmazonInventorySnapshot()) || [];
  var amzBySku = {};
  amz.forEach(function(r) { (amzBySku[_roUpper(r.sku)] = amzBySku[_roUpper(r.sku)] || []).push(r); });

  // overseas_inventory_snapshot + warehouses (3rd Party / overseas stock).
  var overseas = (DB.getOverseasInventorySnapshot && DB.getOverseasInventorySnapshot()) || [];
  var warehouses = (DB.getWarehouses && DB.getWarehouses()) || [];
  var whById = {};
  warehouses.forEach(function(w) { if (w.warehouseId) whById[w.warehouseId] = w; });

  // Factory Stock: sum current_stock per SKU across factory warehouses (REAL — Part 4, unchanged).
  var factory = (DB.getFactoryStock && DB.getFactoryStock()) || [];
  var factoryBySku = {};
  factory.forEach(function(f) { factoryBySku[_roUpper(f.sku)] = (factoryBySku[_roUpper(f.sku)] || 0) + (parseFloat(f.currentStock) || 0); });

  // purchase_order_lines ⋈ purchase_orders (Ongoing Orders — open PO remaining qty).
  var poLines = (DB.getPurchaseOrderLines && DB.getPurchaseOrderLines()) || [];
  var pos = (DB.getPurchaseOrders && DB.getPurchaseOrders()) || [];
  var poById = {};
  pos.forEach(function(p) { poById[p.purchaseOrderId] = p; });
  var poLinesBySku = {};
  poLines.forEach(function(l) { (poLinesBySku[_roUpper(l.sku)] = poLinesBySku[_roUpper(l.sku)] || []).push(l); });

  // supplier_price_list (Lead Time).
  var spl = (DB.getSupplierPriceList && DB.getSupplierPriceList()) || [];
  var splBySku = {};
  spl.forEach(function(r) { (splBySku[_roUpper(r.sku)] = splBySku[_roUpper(r.sku)] || []).push(r); });

  var next3 = _roNextMonths(3);

  function basicT3(sku, country, marketplace) {
    var rows = fcByKey[_roUpper(sku) + '|' + _roUpper(country) + '|' + _roLower(marketplace)];
    if (!rows || !rows.length) return null;
    var total = 0, any = false;
    next3.forEach(function(mo) {
      var row = rows.filter(function(r) { return String(r.year) === String(mo.year); })[0] || rows[0];
      if (row) { total += (parseFloat(row[mo.key]) || 0); any = true; }
    });
    return any ? total : null;
  }
  function siteStock(sku, country, marketplace) {
    var rows = amzBySku[_roUpper(sku)];
    if (!rows || !rows.length) return null;
    var best = null;
    rows.forEach(function(r) {
      // Strict site scoping (E): when a country/marketplace is requested, a snapshot row must actually
      // match it. A blank snapshot country/marketplace must NOT wildcard-match — that was the mechanism
      // by which a US (or blank) snapshot bled into a CA/Amazon row. Missing → no match → "--", never a
      // wrong-site number.
      if (country && _roUpper(r.country || '') !== _roUpper(country)) return;
      if (marketplace && _roLower(r.marketplace || '') !== _roLower(marketplace)) return;
      if (!best || String(r.snapshotDate) > String(best.snapshotDate)) best = r;
    });
    if (!best) return null;
    return (best.availableQty || 0) + (best.fcTransferQty || 0) + (best.fcProcessingQty || 0);
  }
  function thirdParty(sku, country) {
    if (!overseas.length) return null;
    var total = 0, matched = false;
    overseas.forEach(function(r) {
      if (_roUpper(r.sku) !== _roUpper(sku)) return;
      var wh = whById[r.warehouseId];
      if (wh) {
        // Strict country scoping (E): a requested country requires a real warehouse-country match; a
        // blank warehouse country must not wildcard into another site.
        if (country && _roUpper(wh.country || '') !== _roUpper(country)) return;
        var isFactory = _roLower((wh.raw && wh.raw.is_factory_warehouse) || '');
        if (isFactory === 'true' || isFactory === '1' || isFactory === 'yes') return;
      } else if (country) {
        return; // no warehouse record → cannot confirm the country → do not leak into this site
      }
      total += (r.availableStock || 0); matched = true;
    });
    return matched ? total : null;
  }
  function ongoing(sku) {
    var lines = poLinesBySku[_roUpper(sku)];
    if (!lines || !lines.length) return null;
    var total = 0, any = false;
    lines.forEach(function(l) {
      var po = poById[l.purchaseOrderId];
      var st = po ? _roLower(po.status) : '';
      if (!RO_OPEN_PO_STATUS[st]) return;
      var remaining = (l.remainingQty === '' || l.remainingQty == null)
        ? Math.max(0, (l.orderedQty || 0) - Math.max(l.shippedQty || 0, l.completedQty || 0))
        : (l.remainingQty || 0);
      if (remaining > 0) { total += remaining; any = true; }
    });
    return any ? total : null;
  }
  function leadTime(sku) {
    var rows = splBySku[_roUpper(sku)];
    if (!rows || !rows.length) return null;
    var active = rows.filter(function(r) { return _roIsActiveFlag(r.isActive); });
    if (!active.length) return null;
    active.sort(function(a, b) { return String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)); });
    var lt = active[0].leadTimeDays;
    return (lt === '' || lt == null) ? null : lt;
  }

  return mskus.map(function(m) {
    var d = detailBySku[m.sku] || {};
    return {
      // --- Identity + master (REAL) ---
      sku: m.sku,
      country: m.country || '',
      marketplace: m.marketplace || '',
      // Canonical site identity — marketplace_id (C). Filtering/scoping keys on this, never the display
      // string "Amazon" (which collides across US/CA). Falls back to '' only for demo rows (no master).
      marketplaceId: m.marketplaceId || '',
      category: d.category || '',
      series: d.series || '',
      company: m.company || '',
      // --- Mapped from real DB sources (null → "--" when the source is missing) ---
      basicFcT3: basicT3(m.sku, m.country, m.marketplace),          // fc_regular_forecast next 3 months
      specialEventsFc: _roSpecialEventsTotal({ sku: m.sku, company: m.company || '', country: m.country || '', marketplace: m.marketplace || '' }), // fc_special_events prep-month Σ (N+1..N+3)
      siteStock: siteStock(m.sku, m.country, m.marketplace),        // amazon_inventory_snapshot
      thirdPartyStock: thirdParty(m.sku, m.country),                // overseas_inventory_snapshot
      factoryStock: factoryBySku[_roUpper(m.sku)] || 0,             // factory_stock (REAL)
      totalOngoingOrders: ongoing(m.sku),                           // open-PO remaining qty
      leadTime: leadTime(m.sku),                                    // supplier_price_list.lead_time_days
      // --- Placeholders (no formula — guardrail) ---
      risk: null,
      remaining: null,
      suggestedOrder: null,
      boxSize: parseFloat(d.unitsPerCarton) || 0,
      _dbPlaceholder: true
    };
  });
}

// ===== F1-7E-PREREQ-5 · AI-Plan first-layer scoped COMPOSER cutover =====
// The canonical primary read for the first-layer table is the scoped 56_ composer (KM.DB.getAiPlanFirstLayer), which
// REUSES the 52_/53_/54_/55_ Layer-1 owners + identity to return rows byte-identical to _buildRequestOrderRowsFromDb.
// NO broad Operation DB is used for first-layer factual assembly. Layer-2 Gap/Recommendation stay on their existing
// scoped paths; Layer-3 human decision stays on the draft flow. Kill switch (mirrors USE_MATERIALIZED_GAP_READ):
// window.KM_FLAGS.USE_AI_PLAN_FIRST_LAYER_COMPOSER = false → legacy broad-cache path. Canonical default ON.
function _opUseFirstLayerComposer() {
  if (typeof window !== 'undefined' && window.KM_FLAGS && typeof window.KM_FLAGS.USE_AI_PLAN_FIRST_LAYER_COMPOSER === 'boolean') return window.KM_FLAGS.USE_AI_PLAN_FIRST_LAYER_COMPOSER;
  return true;
}
function _opFirstLayerReady() { return !!(window.KM && window.KM.DB && typeof window.KM.DB.getAiPlanFirstLayer === 'function'); }
// planning_cycle authority (PDR-2): resolve the current Asia/Taipei cycle from the SAME _roTpeNow() the browser window
// uses (deterministic per request; the server NEVER uses its clock; matches the legacy current-month window → BEFORE==AFTER).
function _opFirstLayerCycle() { var n = _roTpeNow(); return 'RECO-' + n.year + '-' + String(n.monthIdx + 1).padStart(2, '0'); }

var _opFirstLayerSeq = 0;
var _opFirstLayerRegion = null;
function _opFirstLayerRegion_() {
  if (_opFirstLayerRegion) return _opFirstLayerRegion;
  if (typeof document === 'undefined' || !(window.KM && window.KM.loadState)) return null;
  var el = document.getElementById('ro-scroll-body'); if (!el) return null;
  _opFirstLayerRegion = window.KM.loadState.bindElement(el, 'Loading AI Plan…');
  return _opFirstLayerRegion;
}
// Scoped first-layer read (canonical) + scoped refresh entry. Fail-closed: bounded region ERROR — NO silent legacy
// broad fallback. The broad-DB load lives ONLY in the Legacy branch of initRequestOrderSection.
// F1-7M-A1 · optional refGate: a Promise for a scoped read (the marketplace reference) fired in the SAME wave as the
// composer read at first-open. When supplied, the SUCCESS render is deferred until BOTH resolve, so the marketplace
// dropdown is populated on the first _roRenderAll — identical render ordering to the prior serial chain, but the two
// independent reads are now in flight together instead of one-after-the-other. refGate ALWAYS resolves (its loader
// swallows failure → []), so it never blocks the render indefinitely. Reload/refresh callers pass no gate → the render
// stays synchronous inside this .then (byte-identical to the prior behavior; the ref is already loaded at mount).
function _opLoadFirstLayerComposer_(refGate) {
  var my = ++_opFirstLayerSeq;
  var rg = _opFirstLayerRegion_();
  var el = (typeof document !== 'undefined') ? document.getElementById('ro-scroll-body') : null;
  var hasContent = !!(el && el.querySelector && el.querySelector('.ro-row-wrapper'));
  if (rg) rg.beginLoad(hasContent);
  Promise.resolve(window.KM.DB.getAiPlanFirstLayer({ planning_cycle: _opFirstLayerCycle() })).then(function (res) {
    if (my !== _opFirstLayerSeq) return;
    if (res && res.success) {
      requestOrderState.data = (res.data && res.data.rows) || [];
      var _render = function () {
        if (my !== _opFirstLayerSeq) return;   // a newer composer load superseded this one → drop the stale render
        _roBaseDataStatus = requestOrderState.data.length ? 'LOADED' : 'EMPTY';   // R6B1 — real state (not a disconnect)
        if (rg) rg.set(requestOrderState.data.length ? window.KM.loadState.STATES.READY : window.KM.loadState.STATES.EMPTY);
        _roRenderAll();
        // R6B1 — base rows are in; hydrate the persisted Draft(s) for the loaded scope(s) in the shortest safe order.
        if (typeof _roHydratePersistedDraftsForLoadedScopes_ === 'function') { try { _roHydratePersistedDraftsForLoadedScopes_(); } catch (e) {} }
      };
      if (refGate) { Promise.resolve(refGate).then(_render); } else { _render(); }
    } else {
      _opFirstLayerError_((res && res.errors && res.errors[0]) || (res && res.error) || { code: 'READ_FAILED', message: 'AI Plan first-layer read failed' });
    }
  }).catch(function (e) { if (my !== _opFirstLayerSeq) return; _opFirstLayerError_({ code: 'AI_PLAN_READ_FAILED', message: String(e && e.message || e) }); });
}
function _opFirstLayerError_(err) {
  requestOrderState.data = [];
  _roBaseDataStatus = 'ERROR';   // R6B1 — a real API/read error (distinct from a legitimate empty result)
  var rg = _opFirstLayerRegion_(); if (rg) rg.set(window.KM.loadState.STATES.ERROR);
  var fixedBody = (typeof document !== 'undefined') ? document.getElementById('ro-fixed-body') : null;
  var scrollBody = (typeof document !== 'undefined') ? document.getElementById('ro-scroll-body') : null;
  if (fixedBody) fixedBody.innerHTML = '';
  if (scrollBody) scrollBody.innerHTML = '<div class="ro-empty-state" style="color:#B91C1C;">AI Plan read error: ' + _roEsc((err && err.message) || 'failed') + ' [' + _roEsc((err && err.code) || 'READ_FAILED') + ']</div>';
}

// F1-7N-FA-3C-R6B1 — SPA remount lifecycle. Each mount bumps _roMountEpoch and REBINDS the composer region to the
// CURRENT DOM (the cached _opFirstLayerRegion pointed at the prior mount's detached node → remount showed zero rows +
// a false "Connect the Operation DB"). _roBaseDataStatus distinguishes LOADING / LOADED / EMPTY / ERROR so the empty
// message never claims a disconnect during a transient remount race.
var _roMountEpoch = 0;
var _roBaseDataStatus = 'IDLE';   // IDLE | LOADING | LOADED | EMPTY | ERROR
function initRequestOrderSection() {
  _roMountEpoch++;
  _opFirstLayerRegion = null;   // rebind the loadState region to the CURRENT (remounted) DOM element
  // F1-7N-FB-3 §D — bind the Send guard to the EXISTING mount-epoch authority (no parallel counter), and clear
  // any stale Send status from a previous mount. A Send that resolves after a remount is discarded, not painted.
  // Placed AFTER the region rebind so the epoch-bump/rebind pair stays adjacent (the frozen mount contract).
  try { _roSendState.mountSeq = _roMountEpoch; if (!_roSendState.busy) _roSetSendState_('IDLE', ''); } catch (e) {}
  // Data source priority: live DB (google-sheet) → Demo Data → empty. NEVER the Inventory DOM.
  if (_roUseDb()) {
    _roBaseDataStatus = 'LOADING';
    // F1-7E-PREREQ-5: canonical first-layer = scoped composer (no broad Operation DB for first-layer assembly).
    // F1-7J-A2 + F1-7M-A1: the bounded marketplace reference and the first-layer composer are INDEPENDENT scoped reads.
    // Fire BOTH in the SAME synchronous wave (both HTTP requests in flight together, no longer marketplace-then-composer
    // serial) and hand the ref promise to the composer as its render gate, so the composer still waits for the ref before
    // the first _roRenderAll (marketplace dropdown populated) — identical render ordering, one fewer serial hop. NO broad
    // Operation DB in the canonical path.
    if (_opUseFirstLayerComposer() && _opFirstLayerReady()) { var _mktRefPromise = _roLoadMarketplaceRef_(); _opLoadFirstLayerComposer_(_mktRefPromise); return; }
    // Legacy broad-cache path (kill-switch only) — the ONLY place a broad Operation DB load happens.
    if (!window._opDbCache && window.KM.DB.loadOperationDb) {
      window.KM.DB.loadOperationDb({ force: true }).then(_roInitWithData).catch(_roInitWithData);
      return;
    }
    requestOrderState.data = _buildRequestOrderRowsFromDb();
  } else if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
    requestOrderState.data = _getDemoRequestOrderData();
  } else {
    requestOrderState.data = [];
  }
  _roBaseDataStatus = (requestOrderState.data && requestOrderState.data.length) ? 'LOADED' : 'EMPTY';
  _roRenderAll();
  if (typeof _roHydratePersistedDraftsForLoadedScopes_ === 'function') { try { _roHydratePersistedDraftsForLoadedScopes_(); } catch (e) {} }
}

function _roInitWithData() {
  requestOrderState.data = _buildRequestOrderRowsFromDb();
  _roBaseDataStatus = (requestOrderState.data && requestOrderState.data.length) ? 'LOADED' : 'EMPTY';
  _roRenderAll();
  if (typeof _roHydratePersistedDraftsForLoadedScopes_ === 'function') { try { _roHydratePersistedDraftsForLoadedScopes_(); } catch (e) {} }
}

function _roRenderAll() {
  if (_roUseDb()) _roLoadConfirmationsFromDb();   // rehydrate confirmed state from DB so it persists across reloads
  _populateRequestOrderFilterOptions();
  _populateRequestOrderCategoryTabs();
  renderRequestOrderTable();
  _roBindRowExpandDelegation();   // whole-row expand — bound once per body container (survives re-render)
  syncRequestOrderScroll();
  initRequestOrderDropdowns();
  _roUpdateConfirmStatus();
  if (typeof _roRenderAiPlanResult_ === 'function') _roRenderAiPlanResult_();   // F1-7N-FA-3C-PRE3-R2 — keep the AI Plan result visible across re-renders + hide it on a scope change
}

// Canonical marketplace key for a row: marketplace_id when present (live), else the display string (demo).
function _roMarketplaceKey(item) {
  return (item && item.marketplaceId != null && item.marketplaceId !== '') ? String(item.marketplaceId) : String(item.marketplace || '');
}
// F1-7J-A2 · bounded marketplace REFERENCE for scope resolution. Canonical (composer) mode sources the FULL active
// marketplace master from KM.DB.getMarketplaceReference() (reuses the existing getTable('marketplaces') bounded read —
// no new API) cached in _roMarketplaceRef; Legacy (kill-switch) mode reads the broad getMarketplaces() unchanged. The
// universe is identical either way (same normalizer + filter). Fail-closed: canonical mode NEVER falls back to the broad
// cache (empty universe on ref failure — a bounded degradation, never a silent broad read).
var _roMarketplaceRef = null;   // canonical scoped marketplace master (loaded at mount), or null before load
function _roCanonicalMarketplaceRef_() {
  return _roUseDb() && typeof _opUseFirstLayerComposer === 'function' && _opUseFirstLayerComposer();
}
function _roMarketplaceUniverse() {
  if (_roCanonicalMarketplaceRef_()) return _roMarketplaceRef || [];   // scoped ref only — no broad fallback
  return (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? (window.KM.DB.getMarketplaces() || []) : [];
}
// Load the scoped marketplace reference once per mount (always resolves — a failure yields [] so the caller proceeds
// fail-closed without a broad read). Returns a Promise.
function _roLoadMarketplaceRef_() {
  if (!(window.KM && window.KM.DB && typeof window.KM.DB.getMarketplaceReference === 'function')) { _roMarketplaceRef = []; return Promise.resolve([]); }
  return Promise.resolve(window.KM.DB.getMarketplaceReference())
    .then(function (list) { _roMarketplaceRef = list || []; return _roMarketplaceRef; })
    .catch(function () { _roMarketplaceRef = []; return _roMarketplaceRef; });
}

// Active marketplaces from the master (`marketplaces`). Blank/active/enabled statuses count as active.
function _roActiveMarketplaces() {
  return _roMarketplaceUniverse().filter(function(m) {
    if (!m.marketplaceId) return false;
    var st = _roLower(m.status);
    return st === '' || st === 'active' || st === 'true' || st === 'enabled' || st === '1' || st === 'yes';
  });
}

// Rebuild Country / Marketplace dropdown options from the live data. When there is no data the existing
// (demo) options are left untouched. Risk options stay static (placeholder).
function _populateRequestOrderFilterOptions() {
  if (!(requestOrderState.data && requestOrderState.data.length)) return;
  _roRebuildDropdown('country', _roDistinct(requestOrderState.data.map(function(i) { return i.country; })));
  _roRebuildMarketplaceDropdown();
}

// Marketplace dropdown (B3 / Canonical Decision 2): the visible option is the CHANNEL display name only
// (`marketplace_display_name`, e.g. "Amazon" / "KM Walmart") — NO country suffix. Country already scopes
// geography, so one visible "Amazon" option may stand for ONE OR MORE `marketplace_id`s in the active
// Country scope (e.g. US Amazon under KM and ResUS). The option VALUE is the display-group key; selection
// resolves back to the underlying marketplace_id SET (`requestOrderState.marketplaceGroups`). Identity /
// filter / payload always use marketplace_id — the display string is never a relational key. Falls back
// to the legacy distinct-string dropdown for demo rows that carry no marketplace_id / no master.
function _roRebuildMarketplaceDropdown() {
  var root = document.querySelector('.page-request-order');
  if (!root) return;
  var panel = root.querySelector('.ro-dropdown-panel[data-filter="marketplace"]');
  if (!panel) return;

  var idsInData = {};
  (requestOrderState.data || []).forEach(function(i) { if (i.marketplaceId) idsInData[String(i.marketplaceId)] = 1; });
  var masters = _roActiveMarketplaces().filter(function(m) { return idsInData[String(m.marketplaceId)]; });

  // Demo / no-master fallback → legacy distinct display-string dropdown (still filters by string key).
  if (!masters.length) {
    requestOrderState.marketplaceGroups = {};
    _roRebuildDropdown('marketplace', _roDistinct(requestOrderState.data.map(function(i) { return i.marketplace; })));
    return;
  }

  var cf = requestOrderState.filters.country || [];
  var scoped = masters.filter(function(m) { return !cf.length || cf.indexOf(m.country) !== -1; });

  // Group the scoped marketplaces by display name → the set of underlying marketplace_ids (across
  // country/company). Company stays derivable from each master record; we keep ALL ids per group (never
  // collapse to the first match, never drop a same-named site under a different Company).
  var groups = {};   // displayName → [marketplace_id, ...]
  scoped.forEach(function(m) {
    var name = String(m.marketplaceDisplayName || m.marketplace || '').trim();
    if (!name) return;
    (groups[name] = groups[name] || []).push(String(m.marketplaceId));
  });
  requestOrderState.marketplaceGroups = groups;

  var names = Object.keys(groups).sort(function(a, b) { return a.localeCompare(b); });
  panel.innerHTML = '<label class="ro-checkbox-item"><input type="checkbox" value="" checked onchange="toggleRequestOrderAll(this, \'marketplace\')"> <strong>All</strong></label>' +
    names.map(function(name) {
      return '<label class="ro-checkbox-item"><input type="checkbox" value="' + _roEsc(name) + '" checked onchange="updateRequestOrderFilter(\'marketplace\')"> ' + _roEsc(name) + '</label>';
    }).join('');

  // Prune any previously-selected display group that no longer exists under the current Country scope.
  requestOrderState.filters.marketplace = (requestOrderState.filters.marketplace || []).filter(function(name) { return groups[name]; });
  var text = root.querySelector('.ro-dropdown-trigger[data-filter="marketplace"] .ro-dropdown-text');
  if (text) text.textContent = requestOrderState.filters.marketplace.length ? (requestOrderState.filters.marketplace.length + ' selected') : 'All';
}

// Resolve the selected marketplace display groups → a Set of underlying marketplace_ids (live path).
// Returns null when there are no groups (demo path — caller falls back to display-string matching).
function _roSelectedMarketplaceIdSet() {
  var groups = requestOrderState.marketplaceGroups;
  if (!groups || !Object.keys(groups).length) return null;
  var sel = requestOrderState.filters.marketplace || [];
  var set = {};
  sel.forEach(function(name) { (groups[name] || []).forEach(function(id) { set[String(id)] = 1; }); });
  return set;
}
function _roRebuildDropdown(filterType, vals) {
  var root = document.querySelector('.page-request-order');
  if (!root || !vals.length) return;
  var panel = root.querySelector('.ro-dropdown-panel[data-filter="' + filterType + '"]');
  if (!panel) return;
  panel.innerHTML = '<label class="ro-checkbox-item"><input type="checkbox" value="" checked onchange="toggleRequestOrderAll(this, \'' + filterType + '\')"> <strong>All</strong></label>' +
    vals.map(function(v) {
      return '<label class="ro-checkbox-item"><input type="checkbox" value="' + _roEsc(v) + '" checked onchange="updateRequestOrderFilter(\'' + filterType + '\')"> ' + _roEsc(v) + '</label>';
    }).join('');
  requestOrderState.filters[filterType] = [];
  var text = root.querySelector('.ro-dropdown-trigger[data-filter="' + filterType + '"] .ro-dropdown-text');
  if (text) text.textContent = 'All';
}

// F1-7M-B2-HOTFIX: rows scoped to the CURRENT Country + Marketplace selection ONLY (never Category / SKU / showMode).
// This is the source for the Category chip universe + counts, so the counts represent the records applicable to the
// selected scope and recompute when Country/Marketplace changes. Mirrors the country + marketplace clauses of
// _applyRequestOrderFilters EXACTLY (no new authority; marketplace identity via the marketplace_id set, never the
// display string). No formula/authority change — a pure view-scoping of the existing rows.
function _roCountryMarketplaceScopedRows() {
  var out = requestOrderState.data || [];
  var f = requestOrderState.filters || {};
  var cf = f.country || [];
  if (cf.length) out = out.filter(function (item) { return cf.indexOf(item.country) !== -1; });
  var mf = f.marketplace || [];
  if (mf.length) {
    var idset = (typeof _roSelectedMarketplaceIdSet === 'function') ? _roSelectedMarketplaceIdSet() : null;
    if (idset) out = out.filter(function (item) { return idset[_roMarketplaceKey(item)]; });
    else out = out.filter(function (item) { return mf.indexOf(item.marketplace) !== -1; });
  }
  return out;
}
// Category tabs (Part 2) — built from distinct sku_details.category present in the CURRENT Country+Marketplace scope.
// "All" first. Uses the SHARED Category Tab Rail (.km-tab-rail / .km-tab-rail__tab + count badge) so the Order System
// matches Inventory Replenishment / Promotion Risk. Each tab shows Name + Count; counts reflect the current
// Country+Marketplace-scoped set — selecting a Category never zeroes the other Category counts (they are computed from
// the scoped rows, NOT the post-category-filtered rows). F1-7M-B2-HOTFIX: the scope source is
// _roCountryMarketplaceScopedRows() (was the unscoped requestOrderState.data), so Country/Marketplace changes recompute
// the universe + counts. Single-row horizontal scroll + active-into-view are handled by KM.ui.tabRail.
function _populateRequestOrderCategoryTabs() {
  var container = document.getElementById('ro-category-tabs');
  if (!container) return;
  var data = _roCountryMarketplaceScopedRows();
  var cats = _roDistinct(data.map(function(i) { return i.category; }));
  var active = requestOrderState.categoryTab || 'All';
  if (active !== 'All' && cats.indexOf(active) === -1) { active = 'All'; requestOrderState.categoryTab = 'All'; }
  function countFor(c) { return c === 'All' ? data.length : data.filter(function(i){ return i.category === c; }).length; }
  var tabs = ['All'].concat(cats);
  container.innerHTML = tabs.map(function(c) {
    var cls = 'km-tab-rail__tab' + (c === active ? ' is-active' : '');
    return '<button type="button" class="' + cls + '" data-category="' + _roEsc(c) + '" onclick="setRequestOrderCategory(this.getAttribute(\'data-category\'), this)">' +
      '<span class="km-tab-rail__label">' + _roEsc(c) + '</span>' +
      '<span class="km-tab-rail__count">' + countFor(c) + '</span></button>';
  }).join('');
  if (window.KM && window.KM.ui && window.KM.ui.tabRail) {
    window.KM.ui.tabRail.enhance(container);
    window.KM.ui.tabRail.scrollActiveIntoView(container);
  }
}

function initRequestOrderDropdowns() {
  const root = document.querySelector('.page-request-order');
  if (!root) return;
  
  // Remove existing listeners to prevent duplicates
  const existingTriggers = root.querySelectorAll('.ro-dropdown-trigger');
  existingTriggers.forEach(trigger => {
    const clone = trigger.cloneNode(true);
    trigger.parentNode.replaceChild(clone, trigger);
  });
  
  const triggers = root.querySelectorAll('.ro-dropdown-trigger');
  
  triggers.forEach(trigger => {
    trigger.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const filterType = this.getAttribute('data-filter');
      const panel = root.querySelector(`.ro-dropdown-panel[data-filter="${filterType}"]`);
      
      root.querySelectorAll('.ro-dropdown-panel').forEach(p => {
        if (p !== panel) p.classList.remove('is-open');
      });
      
      if (panel) {
        panel.classList.toggle('is-open');
      }
    });
  });
  
  // Prevent panel from closing when clicking inside
  root.querySelectorAll('.ro-dropdown-panel').forEach(panel => {
    panel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
  
  // Close dropdowns when clicking outside
  const handleOutsideClick = (e) => {
    const isInsideRoot = root.contains(e.target);
    if (!isInsideRoot) return;
    
    const isClickOnTrigger = e.target.closest('.ro-dropdown-trigger');
    const isClickInPanel = e.target.closest('.ro-dropdown-panel');
    
    if (!isClickOnTrigger && !isClickInPanel) {
      root.querySelectorAll('.ro-dropdown-panel').forEach(p => {
        p.classList.remove('is-open');
      });
    }
  };
  
  // Store handler reference for cleanup
  if (root._requestOrderDropdownHandler) {
    document.removeEventListener('click', root._requestOrderDropdownHandler, true);
  }
  root._requestOrderDropdownHandler = handleOutsideClick;
  document.addEventListener('click', handleOutsideClick, true);
  
  const roDateTrigger = document.getElementById('roDateTrigger');
  if (roDateTrigger) {
    // Remove existing listener
    const clone = roDateTrigger.cloneNode(true);
    roDateTrigger.parentNode.replaceChild(clone, roDateTrigger);
    
    // Add new listener
    document.getElementById('roDateTrigger').addEventListener('click', function() {
      openRequestOrderDateModal();
    });
  }
}

function openRequestOrderDateModal() {
  const modal = document.createElement('div');
  modal.className = 'ro-date-modal';
  modal.innerHTML = `
    <div class="ro-date-modal-content">
      <h3>Select Date Range</h3>
      <div class="ro-date-presets">
        <button onclick="selectRequestOrderPreset('last-month')">Last Month</button>
        <button onclick="selectRequestOrderPreset('last-2-months')">Last 2 Months</button>
        <button onclick="selectRequestOrderPreset('last-3-months')">Last 3 Months</button>
        <button onclick="selectRequestOrderPreset('last-year')">Last Year</button>
      </div>
      <div class="ro-date-custom">
        <div class="ro-date-field">
          <label>Start Month</label>
          <input type="month" id="ro-start-month">
        </div>
        <div class="ro-date-field">
          <label>End Month</label>
          <input type="month" id="ro-end-month">
        </div>
      </div>
      <div class="ro-date-actions">
        <button onclick="closeRequestOrderDateModal()">Cancel</button>
        <button onclick="applyRequestOrderDate()">Apply</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  const overlay = document.createElement('div');
  overlay.className = 'ro-date-overlay';
  overlay.onclick = closeRequestOrderDateModal;
  document.body.appendChild(overlay);
}

function closeRequestOrderDateModal() {
  document.querySelector('.ro-date-modal')?.remove();
  document.querySelector('.ro-date-overlay')?.remove();
}

function selectRequestOrderPreset(preset) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-11
  
  let startYear, startMonth, endYear, endMonth;
  
  switch(preset) {
    case 'last-month':
      // 上個月
      if (currentMonth === 0) {
        // 如果當前是1月，上個月是去年12月
        startYear = endYear = currentYear - 1;
        startMonth = endMonth = 11;
      } else {
        startYear = endYear = currentYear;
        startMonth = endMonth = currentMonth - 1;
      }
      break;
    case 'last-2-months':
      // 最近兩個月
      if (currentMonth === 0) {
        startYear = currentYear - 1;
        startMonth = 10; // 去年11月
        endYear = currentYear - 1;
        endMonth = 11; // 去年12月
      } else if (currentMonth === 1) {
        startYear = currentYear - 1;
        startMonth = 11; // 去年12月
        endYear = currentYear;
        endMonth = 0; // 今年1月
      } else {
        startYear = endYear = currentYear;
        startMonth = currentMonth - 2;
        endMonth = currentMonth - 1;
      }
      break;
    case 'last-3-months':
      // 最近三個月
      if (currentMonth === 0) {
        startYear = currentYear - 1;
        startMonth = 9; // 去年10月
        endYear = currentYear - 1;
        endMonth = 11; // 去年12月
      } else if (currentMonth === 1) {
        startYear = currentYear - 1;
        startMonth = 10; // 去年11月
        endYear = currentYear;
        endMonth = 0; // 今年1月
      } else if (currentMonth === 2) {
        startYear = currentYear - 1;
        startMonth = 11; // 去年12月
        endYear = currentYear;
        endMonth = 1; // 今年2月
      } else {
        startYear = endYear = currentYear;
        startMonth = currentMonth - 3;
        endMonth = currentMonth - 1;
      }
      break;
    case 'last-year':
      startYear = endYear = currentYear - 1;
      startMonth = 0;
      endMonth = 11;
      break;
  }
  
  // 格式化為 YYYY-MM
  const formatMonth = (year, month) => {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  };
  
  document.getElementById('ro-start-month').value = formatMonth(startYear, startMonth);
  document.getElementById('ro-end-month').value = formatMonth(endYear, endMonth);
}

function applyRequestOrderDate() {
  const startMonth = document.getElementById('ro-start-month').value;
  const endMonth = document.getElementById('ro-end-month').value;
  
  if (startMonth && endMonth) {
    const trigger = document.getElementById('roDateTrigger');
    const text = trigger.querySelector('.ro-date-trigger-text');
    
    // 如果開始月份和結束月份相同，只顯示一個月份
    if (startMonth === endMonth) {
      text.textContent = startMonth;
    } else {
      text.textContent = `${startMonth} ~ ${endMonth}`;
    }
    
    requestOrderState.filters.dateRange = { startMonth, endMonth };
    
    // 第一次選擇日期時生成數據
    if (requestOrderState.data.length === 0) {
      if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
        requestOrderState.data = _getDemoRequestOrderData();
      } else {
        requestOrderState.data = []; // Demo OFF: no data source
      }
    }
    
    renderRequestOrderTable();
  }
  
  closeRequestOrderDateModal();
}

window.selectRequestOrderPreset = selectRequestOrderPreset;
window.applyRequestOrderDate = applyRequestOrderDate;
window.closeRequestOrderDateModal = closeRequestOrderDateModal;

function toggleRequestOrderAll(checkbox, filterType) {
  const root = document.querySelector('.page-request-order');
  const panel = root.querySelector(`.ro-dropdown-panel[data-filter="${filterType}"]`);
  const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
  checkboxes.forEach(cb => cb.checked = checkbox.checked);
  updateRequestOrderFilter(filterType);
}

function updateRequestOrderFilter(filterType) {
  const root = document.querySelector('.page-request-order');
  const panel = root.querySelector(`.ro-dropdown-panel[data-filter="${filterType}"]`);
  const trigger = root.querySelector(`.ro-dropdown-trigger[data-filter="${filterType}"]`);
  
  if (filterType === 'sku') {
    requestOrderState.filters.sku = document.querySelector('.ro-filter-sku').value;
  } else {
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    const allCheckbox = panel.querySelector('input[value=""]');
    const totalCheckboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
    
    // 如果全選或沒有任何選擇，設為空陣列（表示不篩選）
    if (checkboxes.length === totalCheckboxes.length || checkboxes.length === 0) {
      requestOrderState.filters[filterType] = [];
    } else {
      requestOrderState.filters[filterType] = Array.from(checkboxes).map(cb => cb.value);
    }
    
    allCheckbox.checked = checkboxes.length === totalCheckboxes.length;

    const text = trigger.querySelector('.ro-dropdown-text');
    text.textContent = checkboxes.length === totalCheckboxes.length ? 'All' : `${checkboxes.length} selected`;
  }

  // Country → Marketplace dependency (E/E16): when the Country selection changes, rebuild the
  // marketplace options scoped to the new country and drop any now-incompatible marketplace_id
  // selection (no US/first-match fallback). _roRebuildMarketplaceDropdown prunes invalid selections.
  if (filterType === 'country') {
    _roRebuildMarketplaceDropdown();
  }
  // F1-7M-B2-HOTFIX: Country/Marketplace scope drives the Category chip universe + counts — recompute them immediately
  // when either changes (BEFORE the row render) so the counts always reflect the current Country+Marketplace scope.
  // _populateRequestOrderCategoryTabs resets an out-of-scope active Category to "All" (existing behavior).
  if (filterType === 'country' || filterType === 'marketplace') {
    requestOrderState.searched = false;   // F1-7M-UX: scope change → back to PRE_SEARCH (no stale rows from the prior query)
    _populateRequestOrderCategoryTabs();
  }

  requestOrderState.page = 1;   // filter change → back to page 1 (Part 1)
  renderRequestOrderTable();
}

// Clear All filters: reset filter state + Category/Series dependency + dropdowns + Show mode + SKU
// input, then re-render the FULL dataset. Does NOT re-fetch DB tabs (pure client re-filter).
function clearRequestOrderFilters() {
  const root = document.querySelector('.page-request-order') || document;
  requestOrderState.filters = { country: [], marketplace: [], risk: [], sku: '' };
  requestOrderState.categoryTab = 'All';
  requestOrderState.showMode = 'all';
  requestOrderState.page = 1;
  ['country', 'marketplace', 'risk'].forEach(function (ft) {
    const panel = root.querySelector(`.ro-dropdown-panel[data-filter="${ft}"]`);
    if (panel) panel.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = true; });
    const text = root.querySelector(`.ro-dropdown-trigger[data-filter="${ft}"] .ro-dropdown-text`);
    if (text) text.textContent = 'All';
  });
  const skuInput = root.querySelector('.ro-filter-sku'); if (skuInput) skuInput.value = '';
  const showSel = document.getElementById('ro-show-mode'); if (showSel) showSel.value = 'all';
  const tabs = document.getElementById('ro-category-tabs');
  if (tabs) tabs.querySelectorAll('.ro-tab').forEach(function (t) {
    t.classList.toggle('ro-tab--active', t.getAttribute('data-category') === 'All');
  });
  requestOrderState.searched = false;   // F1-7M-UX: Clear resets the query → PRE_SEARCH
  _populateRequestOrderCategoryTabs();  // scope reset to full universe → recompute Category counts
  renderRequestOrderTable();
}
window.clearRequestOrderFilters = clearRequestOrderFilters;

// 靜態種子數據生成器
function seededRandom(seed) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function generateMockRequestOrderData() {
  const data = [];
  
  // 從 FC Summary 獲取 SKU 列表（去重）
  const fcRegularData = window.fcRegularData || [];
  const uniqueSkus = new Map();
  
  // 收集唯一的 SKU（同一個 SKU 只出現一次）
  fcRegularData.forEach(item => {
    if (!uniqueSkus.has(item.sku)) {
      uniqueSkus.set(item.sku, {
        sku: item.sku,
        series: item.series,
        country: item.country,
        marketplace: item.marketplace,
        category: item.category,
        company: item.company,
        year: item.year,
        months: item.months
      });
    }
  });
  
  // 如果沒有 FC 數據，使用預設 SKU
  if (uniqueSkus.size === 0) {
    const series = ['CO1100', 'CO1150'];
    const countries = ['US', 'UK', 'DE', 'CA', 'JP', 'AU'];
    const marketplaces = ['amazon', 'shopify', 'target'];
    const categories = ['Can Opener', 'Silicone Product', 'Appliances'];
    
    for (let i = 1; i <= 10; i++) {
      uniqueSkus.set(`SKU-${String(i).padStart(3, '0')}`, {
        sku: `SKU-${String(i).padStart(3, '0')}`,
        series: series[i % 2],
        country: countries[i % countries.length],
        marketplace: marketplaces[i % marketplaces.length],
        category: categories[i % categories.length],
        company: 'Kitchen Mama',
        year: new Date().getFullYear(),
        months: Array(12).fill(0).map(() => Math.floor(Math.random() * 1000) + 500)
      });
    }
  }
  
  // 為每個 SKU 生成靜態數據
  let index = 0;
  uniqueSkus.forEach((fcItem) => {
    const seed = fcItem.sku.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // 使用種子生成靜態隨機數
    const rand = (min, max, offset = 0) => {
      const r = seededRandom(seed + offset);
      return Math.floor(r * (max - min + 1)) + min;
    };
    
    // 生成 Risk 等級（基於 SKU 種子）
    const riskSeed = seededRandom(seed + 100);
    let riskLevel;
    if (riskSeed < 0.2) {
      riskLevel = 'High';
    } else if (riskSeed < 0.5) {
      riskLevel = 'Medium';
    } else if (riskSeed < 0.8) {
      riskLevel = 'Low';
    } else {
      riskLevel = 'N/A';
    }
    
    // 靜態庫存數據（前10個SKU的Amazon庫存設為10，前5個SKU的CN和TW也設為10，方便驗證計算）
    const siteStock = index < 10 ? 10 : rand(1000, 3000, 1);
    const siteOnTheWay = rand(0, 500, 2);
    const overseasStock = index === 0 ? 100 : rand(200, 800, 3); // CO1100-R 固定為 100
    const overseasOnTheWay = 0;
    const thisMonthOngoingOrder = index === 0 ? 200 : rand(200, 800, 6); // CO1100-R 固定為 200
    const nextMonthOngoingOrder = index === 0 ? 300 : rand(300, 1000, 7); // CO1100-R 固定為 300
    const fcAllocationRatio = 0.3; // TODO: Stage 3 需實作真實計算
    
    // 從 Factory Stock 頁面獲取該 SKU 該子公司的工廠總庫存
    const factoryStockRecords = window.factoryStockData || [];
    const skuFactoryRecords = factoryStockRecords.filter(f => f.sku === fcItem.sku && f.company === fcItem.company);
    const factoryStockTotal = skuFactoryRecords.reduce((sum, f) => sum + f.stock, 0);
    
    // 計算 Factory Stock 顯示值 = factoryStockTotal × fcAllocationRatio
    const displayFactoryStock = Math.round(factoryStockTotal * fcAllocationRatio);
    
    // 計算顯示用的數值
    const displaySiteStock = siteStock + siteOnTheWay; // Site Stock = siteStock + siteOnTheWay
    const displayThirdPartyStock = overseasStock + overseasOnTheWay; // 3rd Party Stock = overseasStock + overseasOnTheWay
    
    // 從 FC Summary Regular Forecast 抓取 FC 數據
    const currentMonth = new Date().getMonth();
    const currentDate = new Date().getDate();
    const daysInCurrentMonth = new Date(new Date().getFullYear(), currentMonth + 1, 0).getDate();
    const remainingDaysThisMonth = daysInCurrentMonth - currentDate;
    
    const fcThisMonth = fcItem.months[currentMonth] || rand(400, 1400, 7);
    const fcNextMonth = fcItem.months[(currentMonth + 1) % 12] || rand(500, 1500, 8);
    const fcMonth2 = fcItem.months[(currentMonth + 2) % 12] || rand(600, 1600, 9);
    const fcMonth3 = fcItem.months[(currentMonth + 3) % 12] || rand(700, 1700, 10);
    const fcMonth4 = fcItem.months[(currentMonth + 4) % 12] || rand(700, 1700, 19); // Month +4 (T4 demand projection only)
    
    // 計算本月日均 FC
    const fcThisMonthDaily = fcThisMonth / daysInCurrentMonth;
    
    // Campaign FC（未來可從 Event FC 抓取）
    const campaignNextMonth = seededRandom(seed + 11) > 0.6 ? rand(100, 300, 11) : 0;
    const campaignMonth2 = seededRandom(seed + 12) > 0.7 ? rand(150, 400, 12) : 0;
    const campaignMonth3 = seededRandom(seed + 13) > 0.8 ? rand(200, 500, 13) : 0;
    const campaignMonth4 = seededRandom(seed + 20) > 0.8 ? rand(200, 500, 20) : 0;
    
    // 從 SKU Details 獲取單箱數量
    const allSkuDetails = [...window.upcomingSkuData || [], ...window.runningSkuData || [], ...window.phasingOutSkuData || []];
    const skuDetail = allSkuDetails.find(s => s.sku === fcItem.sku);
    const boxSize = skuDetail?.unitsPerCarton || 12; // 如果找不到就使用預設值 12
    
    // 使用計算引擎計算缺口
    const shortageResult = window.KM && window.KM.utils && window.KM.utils.forecastEngine 
      ? window.KM.utils.forecastEngine.calculateShortage({
          siteStock,
          siteOnTheWay,
          overseasStock,
          overseasOnTheWay,
          factoryStockCN: factoryStockTotal * 0.6,
          factoryStockTW: factoryStockTotal * 0.4,
          thisMonthOngoingOrder,
          nextMonthOngoingOrder,
          fcAllocationRatio,
          fcThisMonthDaily,
          remainingDaysThisMonth,
          fcNextMonth,
          fcMonth2,
          fcMonth3,
          fcMonth4,
          campaignNextMonth,
          campaignMonth2,
          campaignMonth3,
          campaignMonth4,
          tfThisMonth: 1.0,
          tfNextMonth: 1.0,
          tfMonth2: 1.0,
          tfMonth3: 1.0,
          campaignTfNextMonth: 1.0,
          campaignTfMonth2: 1.0,
          campaignTfMonth3: 1.0
        })
      : { shortageMonth1: 0, shortageMonth2: 0, shortageMonth3: 0 };
    
    data.push({
      sku: fcItem.sku,
      series: fcItem.series,
      country: fcItem.country,
      marketplace: fcItem.marketplace,
      category: fcItem.category,
      risk: riskLevel, // 新增 Risk 欄位
      achievementRate: rand(80, 120, 14),
      forecast: rand(3000, 8000, 15),
      actual: rand(2500, 7500, 16),
      sessions: rand(5000, 15000, 17),
      usp: (seededRandom(seed + 18) * 5 + 10).toFixed(2) + '%',
      basicFcT3: fcNextMonth + fcMonth2 + fcMonth3,
      specialEventsFc: campaignNextMonth + campaignMonth2 + campaignMonth3,
      siteStock: displaySiteStock,
      thirdPartyStock: displayThirdPartyStock,
      factoryStock: displayFactoryStock,
      totalOngoingOrders: thisMonthOngoingOrder + nextMonthOngoingOrder,
      mockAiRecommendedUnits: rand(0, 800, 21),
      boxSize: boxSize,
      lastMonth: {
        achievementRate: rand(85, 115, 22),
        forecastUnits: rand(800, 2300, 23),
        actualUnits: rand(700, 2200, 24),
        sessions: rand(1500, 4500, 25),
        usp: (seededRandom(seed + 26) * 3 + 2).toFixed(2)
      },
      last2Month: {
        achievementRate: rand(80, 110, 27),
        forecastUnits: rand(700, 2200, 28),
        actualUnits: rand(650, 2150, 29),
        sessions: rand(1400, 4400, 30),
        usp: (seededRandom(seed + 31) * 3 + 2).toFixed(2)
      },
      last3Month: {
        achievementRate: rand(75, 105, 32),
        forecastUnits: rand(600, 2100, 33),
        actualUnits: rand(600, 2100, 34),
        sessions: rand(1300, 4300, 35),
        usp: (seededRandom(seed + 36) * 3 + 2).toFixed(2)
      },
      campaignLastMonth: {
        name: ['Prime', 'Fall Prime', 'BFCM'][index % 3],
        achievementRate: rand(70, 110, 37),
        forecastUnits: rand(300, 1100, 38),
        actualUnits: rand(250, 1050, 39),
        sessions: rand(800, 2800, 40),
        usp: (seededRandom(seed + 41) * 4 + 1.5).toFixed(2)
      },
      campaignLast2Month: {
        name: ['Prime', 'Fall Prime', 'BFCM'][(index + 1) % 3],
        achievementRate: rand(65, 105, 42),
        forecastUnits: rand(250, 1050, 43),
        actualUnits: rand(200, 1000, 44),
        sessions: rand(700, 2700, 45),
        usp: (seededRandom(seed + 46) * 4 + 1.5).toFixed(2)
      },
      campaignLast3Month: {
        name: ['Prime', 'Fall Prime', 'BFCM'][(index + 2) % 3],
        achievementRate: rand(60, 100, 47),
        forecastUnits: rand(200, 1000, 48),
        actualUnits: rand(180, 980, 49),
        sessions: rand(600, 2600, 50),
        usp: (seededRandom(seed + 51) * 4 + 1.5).toFixed(2)
      },
      nextMonth: {
        baseFc: fcNextMonth,
        campaignFc: campaignNextMonth
      },
      next2Month: {
        baseFc: fcMonth2,
        campaignFc: campaignMonth2
      },
      next3Month: {
        baseFc: fcMonth3,
        campaignFc: campaignMonth3
      },
      factoryOngoingThisMonth: thisMonthOngoingOrder,
      factoryOngoingNextMonth: nextMonthOngoingOrder,
      shortageM1: shortageResult.shortageMonth1,
      shortageM2: shortageResult.shortageMonth2,
      shortageM3: shortageResult.shortageMonth3,
      // Full canonical engine result stashed for the second-level Tier Projection evidence (DISPLAY only —
      // this is the engine's OWN output, not a new formula). Live-DB rows have no _engine → evidence "--".
      _engine: {
        totalSiteStock: shortageResult.totalSiteStock, factoryStockTotal: shortageResult.factoryStockTotal,
        fcThisMonth: shortageResult.fcThisMonth, t1Fc: shortageResult.t1Fc, t2Fc: shortageResult.t2Fc,
        t3Fc: shortageResult.t3Fc, t4Fc: shortageResult.t4Fc, supplyBase: shortageResult.supplyBase
      },
      // 保留 FC Summary 來源資訊（Stage 3 使用）
      _fcSource: {
        year: fcItem.year,
        company: fcItem.company,
        allMonths: fcItem.months
      }
    });
    
    index++;
  });
  
  return data;
}

function setRequestOrderSeries(series) {
  requestOrderState.series = series;
  
  document.querySelectorAll('.ro-tab').forEach(tab => {
    tab.classList.remove('ro-tab--active');
  });
  event.target.classList.add('ro-tab--active');

  renderRequestOrderTable();
}

// Category tab click (Part 2) — sets the active Category tab and re-renders (page → 1). Active styling +
// scroll-into-view use the shared Tab Rail classes (.km-tab-rail__tab / .is-active).
function setRequestOrderCategory(cat, btn) {
  requestOrderState.categoryTab = cat || 'All';
  requestOrderState.page = 1;
  const container = document.getElementById('ro-category-tabs');
  if (container) container.querySelectorAll('.km-tab-rail__tab').forEach(t => t.classList.remove('is-active'));
  if (btn && btn.classList) btn.classList.add('is-active');
  if (container && window.KM && window.KM.ui && window.KM.ui.tabRail) window.KM.ui.tabRail.scrollActiveIntoView(container);
  renderRequestOrderTable();
}

// Search button (Part 1) — reads the SKU keyword input and re-renders (keyword contains-match; page → 1).
function handleRequestOrderSearch() {
  const input = document.querySelector('.ro-filter-sku');
  requestOrderState.filters.sku = input ? String(input.value || '').trim() : '';
  requestOrderState.page = 1;
  requestOrderState.searched = true;   // F1-7M-UX: explicit Search → reveal the current scoped result rows
  // F1-7N-FA-3C-R6B1 — Search recovers a remount-empty page WITHOUT a hard refresh: if the DB is available but base
  // data is missing (and not already loading), deterministically re-run the base load; else render + hydrate.
  if (_roUseDb() && (!requestOrderState.data || !requestOrderState.data.length) && _roBaseDataStatus !== 'LOADING') {
    initRequestOrderSection();
    return;
  }
  renderRequestOrderTable();
  // F1-7N-FA-3C-R6B — hydrate the persisted flat Draft for the searched scope(s) so Order Allocation shows the saved
  // order_qty/carton/note WITHOUT running AI Plan (read-only; silent; never opens the AI Plan Result popup).
  if (typeof _roHydratePersistedDraftsForLoadedScopes_ === 'function') { try { _roHydratePersistedDraftsForLoadedScopes_(); } catch (e) {} }
}

// ---- F1-4B-FM5-R4J · "Recalculate All Sites" (Order Planning Gap) — BACKEND-OWNED RESUMABLE JOB -------------
// Identical lifecycle contract as Inventory (window.KM.gapRecalc.runJob): one click STARTS one backend job (quick
// write; NO calculation in the request, NO write retry) then the page POLLS a READ-ONLY status endpoint to terminal
// (Starting… / Calculating N/M / Refreshing… / Completed). The backend owns the ~13.5-min job to completion even if
// this tab closes/refreshes (recovered on mount by _roResumeGapJobOnMount_). Manual Order Qty / Carton / Note are
// user decision data and are NEVER touched. Shared-pool conservation is preserved server-side (per-company chunking).
var _roRecalcAllBusy = false;
var _roActiveRunId = null;         // LIVE4 — active backend runId (for a targeted Cancel)
var _roCancelRequested = false;    // LIVE4 — set once by the Cancel button so the poller stops cooperatively
function _roRecalcBtn_() { return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('ro-recalc-all-btn') : null; }
function _roCancelBtn_() { return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('ro-cancel-recalc-btn') : null; }
function _roShowCancel_(show) { var c = _roCancelBtn_(); if (c) { c.style.display = show ? '' : 'none'; if (show) c.disabled = false; } }
// LIVE10 §13/§14 — ONE handler, optional bounded scope. For Order Planning a sub-company scope is EXPANDED to the
// whole company server-side (shared-pool conservation); omitted ⇒ ALL_SITES (existing button, unchanged).
function handleRecalcAllOrderPlanningGap(scopeSpec) {
  if (_roRecalcAllBusy) return;
  if (!(window.KM && window.KM.DB && typeof window.KM.DB.startOrderPlanningGapJob === 'function')) {
    alert('Recalculation service is unavailable (Operation DB API not configured).');
    return;
  }
  var _scopeMode = (scopeSpec && scopeSpec.mode) ? String(scopeSpec.mode) : 'ALL_SITES';
  var _scopeText = (_scopeMode === 'CURRENT_SCOPE' || _scopeMode === 'CURRENT_COUNTRY') ? 'the SELECTED company (shared-pool conservation expands the selection to the whole company)' : 'ALL sites';
  if (typeof window.confirm === 'function' && !window.confirm('Start a recalculation of the materialized order-planning gap for ' + _scopeText + '?\n\nThis runs as a backend job that keeps going even if you close or refresh this page. The latest T1–T4 result per site/SKU is overwritten. Manual Order Qty is never changed.')) return;
  var btn = _roRecalcBtn_();
  var label = (btn && btn.dataset && btn.dataset.idleLabel) ? btn.dataset.idleLabel : (btn ? btn.textContent : '');
  if (btn && btn.dataset) btn.dataset.idleLabel = label || 'Recalculate All Sites';
  _roRecalcAllBusy = true; _roActiveRunId = null; _roCancelRequested = false;
  function setBtn(txt, disabled) { if (btn) { btn.disabled = !!disabled; btn.textContent = txt; } }
  // §8 the ONE deterministic reset — always hides Cancel and returns the button to idle.
  function restore() { _roRecalcAllBusy = false; _roActiveRunId = null; _roShowCancel_(false); setBtn(label || 'Recalculate All Sites', false); }
  var gr = (window.KM && window.KM.gapRecalc) ? window.KM.gapRecalc : null;
  var startFn = function () { return window.KM.DB.startOrderPlanningGapJob(scopeSpec ? { payload: { scope: scopeSpec } } : {}); };   // the WRITE POST — exactly ONCE (optional bounded scope §13)
  var statusFn = function () { return window.KM.DB.getGapJobStatus('ORDER_PLANNING'); };
  var refreshFn = function () { if (typeof refreshOrderPlanningGapAfterRecalc_ === 'function') return refreshOrderPlanningGapAfterRecalc_(); };
  if (!gr || typeof gr.runJob !== 'function') {
    setBtn('Starting…', true);
    return Promise.resolve(startFn()).then(function () { refreshFn(); restore(); }).catch(function () { restore(); });
  }
  return gr.runJob(startFn, statusFn, {
    product: 'ORDER_PLANNING',   // LIVE7 §3 — names the product in the [GapJob] START_ERROR DevTools diagnostic
    refresh: refreshFn,
    onRunId: function (rid) { _roActiveRunId = rid; },
    isCancelled: function () { return _roCancelRequested; },
    ui: {
      starting: function () { setBtn('Starting…', true); },
      progress: function (st) { if (!(st && st.status)) return; var n = (st && st.scopesProcessed != null) ? st.scopesProcessed : 0, m = (st && st.scopesTotal != null) ? st.scopesTotal : 0; setBtn((st && st.recovering ? 'Recovering… ' : 'Calculating… ') + n + ' / ' + m, true); _roShowCancel_(true); },   // LIVE10 §11 guard non-status polls; §7 Recovering
      refreshing: function () { _roShowCancel_(false); setBtn('Refreshing…', true); },
      // F1-SMALL-GAP-JOB-DONE-NOTICE-R1: MANUAL runJob done() — fires only on terminal DONE AFTER refresh(); one notice
      // per manual run (keyed to _roActiveRunId). The resume-on-mount done() below does NOT announce (scheduled/resumed
      // jobs stay silent).
      done: function (finalState) { _roShowCancel_(false); setBtn('Completed', true); try { if (gr && typeof gr.announceManualDone === 'function') gr.announceManualDone(_roActiveRunId, gr.formatDoneMessage('Order Planning', scopeSpec, finalState)); } catch (e) {} if (typeof setTimeout === 'function') setTimeout(restore, 1500); else restore(); },
      cancelled: function () { _roShowCancel_(false); setBtn('Cancelled — results preserved', true); try { console.info('[GapJob] Calculation cancelled. Latest completed results are preserved.'); } catch (e) {} if (typeof setTimeout === 'function') setTimeout(restore, 1500); else restore(); },
      failed: function (st) { alert(_roGapJobFailMsg_('Order Planning', st)); restore(); }
    }
  });
}
window.handleRecalcAllOrderPlanningGap = handleRecalcAllOrderPlanningGap;
// LIVE10 §14 — STABLE AI-Assist callable contracts (no toolbar redesign in this round). Placed by a later UI round
// under an "AI Assist" menu with the existing Generate AI Plan (handleRequestOrderAiPlan). They REUSE the one recalc
// handler (no duplicated lifecycle). OP sub-company scopes expand to the whole company server-side (conservation).
function _roCurrentScopeSpec_(mode) {
  var st = (typeof requestOrderState !== 'undefined' && requestOrderState) ? requestOrderState : null;
  var sc = st ? (st.scope || (st.filters ? st.filters.scope : null)) : null;
  if (!sc || !sc.company) return { mode: 'ALL_SITES' };
  return { mode: mode, company: sc.company, country: sc.country, marketplace: sc.marketplace };
}
function recalcOrderPlanningGapAllSites() { return handleRecalcAllOrderPlanningGap({ mode: 'ALL_SITES' }); }
function recalcOrderPlanningGapCurrentCountry() { return handleRecalcAllOrderPlanningGap(_roCurrentScopeSpec_('CURRENT_COUNTRY')); }
function recalcOrderPlanningGapCurrentScope() { return handleRecalcAllOrderPlanningGap(_roCurrentScopeSpec_('CURRENT_SCOPE')); }
window.recalcOrderPlanningGapAllSites = recalcOrderPlanningGapAllSites;
window.recalcOrderPlanningGapCurrentCountry = recalcOrderPlanningGapCurrentCountry;
window.recalcOrderPlanningGapCurrentScope = recalcOrderPlanningGapCurrentScope;

// ============================================================================
// F1-UI-RUNTIME-CLOSURE-R1 — Order Planning "AI Support" dropdown (AI Plan + Recalculate Current Scope + All Sites).
// UI-only relocation out of the main toolbar; each item REUSES the existing handler verbatim (no second gap engine,
// no duplicate recommendation engine). Same accessible pattern as Inventory; shared .km-action-menu visual primitive.
// ============================================================================
var _roAiSupportBound = false;
function _roAiEls() {
    return { menu: document.getElementById('roAiSupportMenu'), trigger: document.getElementById('roAiSupportTrigger'), list: document.getElementById('roAiSupportList') };
}
function _roAiItems() {
    var e = _roAiEls();
    if (!e.list) return [];
    return Array.prototype.slice.call(e.list.querySelectorAll('.km-action-menu__item')).filter(function (b) { return !b.disabled; });
}
function _roAiOpen() {
    var e = _roAiEls();
    if (!e.list || !e.trigger || !e.list.hidden) return;
    e.list.hidden = false; e.trigger.setAttribute('aria-expanded', 'true'); if (e.menu) e.menu.classList.add('is-open');
    _roBindAiSupportGlobal();
    var first = _roAiItems()[0]; if (first) first.focus();
}
function _roAiClose(returnFocus) {
    var e = _roAiEls();
    if (!e.list || e.list.hidden) return;
    e.list.hidden = true; if (e.trigger) e.trigger.setAttribute('aria-expanded', 'false'); if (e.menu) e.menu.classList.remove('is-open');
    if (returnFocus && e.trigger) e.trigger.focus();
}
function toggleRoAiSupportMenu(ev) {
    if (ev) { try { ev.stopPropagation(); } catch (_e) {} }
    var e = _roAiEls(); if (!e.list) return;
    if (e.list.hidden) _roAiOpen(); else _roAiClose(false);
}
// F1-AI-SUPPORT-SCOPE-R1: "AI Plan" and "Recalculate Current Scope" open the shared scope-selection modal so the
// user picks a CONCRETE Country / Marketplace first; on Confirm they delegate to the SAME existing handlers (no new
// route/engine). "Recalculate All Sites" is unchanged. (OP semantics: a sub-company scope is expanded to the whole
// company server-side for shared-pool conservation — the modal still passes the concrete {company,country,marketplace}.)
function runRoAiSupport(kind) {
    _roAiClose(false);
    if (kind === 'aiplan') return _openRoScopeModal('aiplan');
    if (kind === 'recalcScope') return _openRoScopeModal('recalc');
    if (kind === 'recalcAll' && typeof handleRecalcAllOrderPlanningGap === 'function') return handleRecalcAllOrderPlanningGap();
}
// Prefill from the current OP toolbar scope (requestOrderState.filters — multi-select arrays). Only prefill a
// concrete value: a single selected country, and a marketplace ONLY when it resolves unambiguously to one active
// marketplace_id under that country. All/ambiguous → left unselected (never silently treated as current scope — §6).
function _roScopeModalPrefill_() {
    var out = { country: '', marketplaceId: '' };
    try {
        var st = (typeof requestOrderState !== 'undefined' && requestOrderState) ? requestOrderState : null;
        var f = st ? st.filters : null;
        if (f && Array.isArray(f.country) && f.country.length === 1) out.country = String(f.country[0]);
        if (out.country && f && Array.isArray(f.marketplace) && f.marketplace.length === 1 && window.KM && window.KM.scopeModal) {
            var groups = (st && st.marketplaceGroups) || {};
            var ids = groups[f.marketplace[0]] || [];
            if (ids && typeof ids.length === 'number') {
                var all = _roMarketplaceUniverse();   // F1-7J-A2: canonical = scoped ref; Legacy = broad getter
                var inCountry = window.KM.scopeModal.marketplacesForCountry(all, out.country);
                var match = inCountry.filter(function (m) { return Array.prototype.indexOf.call(ids, String(m.marketplaceId)) !== -1; });
                if (match.length === 1) out.marketplaceId = String(match[0].marketplaceId);
            }
        }
    } catch (e) {}
    return out;
}
function _openRoScopeModal(action) {
    if (!(window.KM && window.KM.scopeModal && typeof window.KM.scopeModal.open === 'function')) {
        if (action === 'aiplan' && typeof handleRequestOrderAiPlan === 'function') return handleRequestOrderAiPlan();
        if (action === 'recalc' && typeof recalcOrderPlanningGapCurrentScope === 'function') return recalcOrderPlanningGapCurrentScope();
        return;
    }
    window.KM.scopeModal.open({
        title: action === 'aiplan' ? 'AI Plan — Order Planning' : 'Recalculate Current Scope — Order Planning',
        subtitle: action === 'aiplan' ? 'Select the scope for AI Plan' : 'Select the scope to recalculate',
        confirmLabel: action === 'aiplan' ? 'Generate AI Plan' : 'Recalculate Scope',
        prefill: _roScopeModalPrefill_(),
        onConfirm: function (scope) {
            if (action === 'aiplan') {
                if (typeof handleRequestOrderAiPlan === 'function') handleRequestOrderAiPlan(scope);
            } else {
                // EXISTING CURRENT_SCOPE gap job (LIVE10 contract). No new route; server expands sub-company scope.
                if (typeof handleRecalcAllOrderPlanningGap === 'function') {
                    handleRecalcAllOrderPlanningGap({ mode: 'CURRENT_SCOPE', company: scope.company, country: scope.country, marketplace: scope.marketplace });
                }
            }
        }
    });
}
function _roBindAiSupportGlobal() {
    if (_roAiSupportBound) return;
    document.addEventListener('click', function (ev) {
        var e = _roAiEls();
        if (!e.list || e.list.hidden) return;
        if (ev.target && ev.target.closest && ev.target.closest('#roAiSupportMenu')) return;
        _roAiClose(false);
    });
    document.addEventListener('keydown', function (ev) {
        var e = _roAiEls();
        if (!e.list || e.list.hidden) return;
        var items = _roAiItems(); if (!items.length) return;
        var idx = items.indexOf(document.activeElement);
        if (ev.key === 'Escape') { ev.preventDefault(); _roAiClose(true); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); (items[(idx + 1) % items.length] || items[0]).focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); (items[(idx - 1 + items.length) % items.length] || items[items.length - 1]).focus(); }
        else if (ev.key === 'Home') { ev.preventDefault(); items[0].focus(); }
        else if (ev.key === 'End') { ev.preventDefault(); items[items.length - 1].focus(); }
        else if (ev.key === 'Tab') { _roAiClose(false); }
    });
    _roAiSupportBound = true;
}
window.toggleRoAiSupportMenu = toggleRoAiSupportMenu;
window.runRoAiSupport = runRoAiSupport;

// LIVE4 §6 — manual Cancel (Order Planning): ONE backend cancel write for the active runId; stop the poller; the
// shared runJob poller then refreshes the materialized READ and resets the button (never browser-only, no reload).
function handleCancelOrderPlanningGapJob() {
  if (!_roRecalcAllBusy || _roCancelRequested) return;
  var c = _roCancelBtn_(); if (c) c.disabled = true;
  _roCancelRequested = true;
  try { console.info('[GapJob] CANCEL_REQUEST ORDER_PLANNING run=' + _roActiveRunId); } catch (e) {}
  if (window.KM && window.KM.DB && typeof window.KM.DB.cancelOrderPlanningGapJob === 'function') {
    try { window.KM.DB.cancelOrderPlanningGapJob(_roActiveRunId); } catch (e) {}   // exactly ONE cancel write
  }
}
window.handleCancelOrderPlanningGapJob = handleCancelOrderPlanningGapJob;

// §5/§12 — truthful terminal message (shared contract with Inventory). STALLED / POLL_TIMEOUT = "could not be
// confirmed" (recoverable, NO auto retry); any other non-DONE state = a genuine failure. Button returns to idle.
function _roGapJobFailMsg_(product, st) {
  var gr = (window.KM && window.KM.gapRecalc), status = (st && st.status) || 'unknown';
  if (gr && typeof gr.isUnconfirmedJob === 'function' && gr.isUnconfirmedJob(status)) {
    return product + ' calculation status could not be confirmed. Check the latest data before retrying (no automatic retry was issued).';
  }
  var why = (st && st.lastError) ? (' — ' + st.lastError) : '';
  return product + ' recalculation failed (status: ' + status + ')' + why + '.\nNo automatic retry was issued; check the latest data.';
}
window._roGapJobFailMsg_ = _roGapJobFailMsg_;

// §13 mount/reload recovery — resume READ-ONLY polling if a backend Order Planning job is already PENDING/RUNNING.
function _roResumeGapJobOnMount_() {
  var gr = (window.KM && window.KM.gapRecalc), db = (window.KM && window.KM.DB);
  if (!gr || typeof gr.resumeIfRunning !== 'function' || !db || typeof db.getGapJobStatus !== 'function') return;
  var btn = _roRecalcBtn_();
  var label = (btn && btn.dataset && btn.dataset.idleLabel) ? btn.dataset.idleLabel : (btn ? btn.textContent : 'Recalculate All Sites');
  if (btn && btn.dataset) btn.dataset.idleLabel = label;
  function setBtn(txt, disabled) { if (btn) { btn.disabled = !!disabled; btn.textContent = txt; } }
  function resReset() { _roRecalcAllBusy = false; _roActiveRunId = null; _roShowCancel_(false); setBtn(label, false); }
  _roCancelRequested = false;
  return gr.resumeIfRunning(function () { return db.getGapJobStatus('ORDER_PLANNING'); }, {
    refresh: function () { if (typeof refreshOrderPlanningGapAfterRecalc_ === 'function') return refreshOrderPlanningGapAfterRecalc_(); },
    isCancelled: function () { return _roCancelRequested; },
    ui: {
      resume: function (st) { _roRecalcAllBusy = true; if (st && st.runId) _roActiveRunId = st.runId; },
      progress: function (st) { if (!(st && st.status)) return; if (st && st.runId) _roActiveRunId = st.runId; var n = (st && st.scopesProcessed != null) ? st.scopesProcessed : 0, m = (st && st.scopesTotal != null) ? st.scopesTotal : 0; setBtn((st && st.recovering ? 'Recovering… ' : 'Calculating… ') + n + ' / ' + m, true); _roShowCancel_(true); },
      refreshing: function () { _roShowCancel_(false); setBtn('Refreshing…', true); },
      done: function () { _roShowCancel_(false); setBtn('Completed', true); if (typeof setTimeout === 'function') setTimeout(resReset, 1500); else resReset(); },
      cancelled: function () { _roShowCancel_(false); setBtn('Cancelled — results preserved', true); if (typeof setTimeout === 'function') setTimeout(resReset, 1500); else resReset(); },
      // §5 a resumed job that ends non-DONE (stalled/failed) must NOT leave the button stuck at Calculating.
      failed: function (st) { resReset(); if (st && st.status && st.status !== 'DONE') { try { console.warn(_roGapJobFailMsg_('Order Planning', st)); } catch (e) {} } }
    }
  });
}
window._roResumeGapJobOnMount_ = _roResumeGapJobOnMount_;
// Newest calculated_at among the loaded materialized OP rows (server 'YYYY-MM-DD HH:MM:SS' → lexical compare).
function _roMaxCalculatedAt_() {
  var by = (typeof _opMatCache !== 'undefined' && _opMatCache && _opMatCache.bySku) || {}; var mx = '';
  for (var k in by) { if (Object.prototype.hasOwnProperty.call(by, k)) { var c = by[k] && by[k].calculated_at ? String(by[k].calculated_at) : ''; if (c > mx) mx = c; } }
  return mx;
}

function setRequestOrderShowMode(mode) {
  requestOrderState.showMode = mode;
  requestOrderState.page = 1;
  renderRequestOrderTable();
}

// ---- Pagination controls (Part 1) ----
function _roRenderPagination(totalRows, totalPages, startIdx, pageCount) {
  const el = document.getElementById('ro-pagination');
  if (!el) return;
  if (!totalRows) { el.innerHTML = ''; return; }
  const page = requestOrderState.page;
  const from = totalRows ? startIdx + 1 : 0;
  const to = startIdx + pageCount;
  // Shared .km-table-footer layout (matches FC Summary): Showing left, controls right.
  el.innerHTML =
    '<div class="km-table-footer__left">Showing ' + from + '-' + to + ' of ' + totalRows + ' rows</div>' +
    '<div class="km-table-footer__right">' +
      '<button type="button" class="km-page-btn" ' + (page <= 1 ? 'disabled' : '') + ' onclick="roPrevPage()">‹ Previous</button>' +
      '<span class="km-page-info">Page ' + page + ' / ' + totalPages + '</span>' +
      '<button type="button" class="km-page-btn" ' + (page >= totalPages ? 'disabled' : '') + ' onclick="roNextPage()">Next ›</button>' +
    '</div>';
}
function roPrevPage() {
  if (requestOrderState.page > 1) { requestOrderState.page--; renderRequestOrderTable(); }
}
function roNextPage() {
  requestOrderState.page++;   // clamped inside renderRequestOrderTable
  renderRequestOrderTable();
}

// Shared filter pipeline (Request Order Mapping v1). Applied identically by the table render and
// Send Request so the filtered set is always consistent.
//   • Category tab   — sku_details.category (Part 2)
//   • Country / Marketplace — OR semantics (Part 1): neither → all; one → that one; both → country OR marketplace
//   • Risk           — placeholder filter (no-op until the risk engine exists)
//   • SKU            — keyword contains-match
function _applyRequestOrderFilters(data) {
  let out = data || [];
  const f = requestOrderState.filters;

  if (requestOrderState.categoryTab && requestOrderState.categoryTab !== 'All') {
    out = out.filter(item => item.category === requestOrderState.categoryTab);
  }

  // AND across dimensions (2026-07-22 fix — was OR): a row must satisfy EVERY active filter.
  // An empty selection ("All" / blank) means that dimension is unconstrained.
  const cf = f.country || [];
  if (cf.length) out = out.filter(item => cf.includes(item.country));

  // Marketplace filter (B3): the selection holds display-group keys; resolve them to the underlying
  // marketplace_id SET and keep rows whose marketplace_id is in that set (canonical identity — the
  // "Amazon" display string is never the relational key). Demo rows (no id / no groups) fall back to
  // matching the display string.
  const mf = f.marketplace || [];
  if (mf.length) {
    const idset = _roSelectedMarketplaceIdSet();
    if (idset) out = out.filter(item => idset[_roMarketplaceKey(item)]);
    else out = out.filter(item => mf.includes(item.marketplace));
  }

  const rf = f.risk || [];
  if (rf.length) out = out.filter(item => rf.includes(item.risk));

  if (f.sku) {
    const kw = String(f.sku).toLowerCase();
    out = out.filter(item => String(item.sku || '').toLowerCase().includes(kw));
  }
  return out;
}

function renderRequestOrderTable() {
  // F1-7M-UX explicit-Search gate (SINGLE centralized gate): normal Order Planning result rows are shown ONLY after
  // the user presses Search. Before that — initial mount, or after a Country/Marketplace/Clear scope change — render a
  // NEUTRAL pre-search state. This is PRE_SEARCH, deliberately distinct from EMPTY / "No Data" / Demo / disconnected /
  // error. Because the gate lives here, async arrivals (first-layer composer, gap/recommendation callbacks, post-write
  // refresh) can NEVER expose rows before Search. Filters, Category chips/counts and alert/notification hooks are
  // populated by _roRenderAll (not here), so they stay visible regardless of searched.
  if (!requestOrderState.searched) {
    var psFixed = document.getElementById('ro-fixed-body');
    var psScroll = document.getElementById('ro-scroll-body');
    if (psFixed) psFixed.innerHTML = '';
    if (psScroll) psScroll.innerHTML = '<div class="ro-empty-state ro-presearch-state">Select filters and press Search to view results.</div>';
    if (typeof _roRenderPagination === 'function') _roRenderPagination(0, 1, 0, 0);
    return;
  }
  // 如果沒有數據，顯示提示訊息 — F1-7N-FA-3C-R6B1: state-aware. Only claim a DB disconnect when the DB is genuinely
  // unavailable (!_roUseDb) — NEVER for a transient remount race, an in-flight load, or a legitimate empty result.
  if (!requestOrderState.data || requestOrderState.data.length === 0) {
    const fixedBody = document.getElementById('ro-fixed-body');
    const scrollBody = document.getElementById('ro-scroll-body');
    var _emptyMsg;
    // F1-7N-FA-3C-R6B2 — IDLE is a TRANSIENT pre-load state (mount has not yet flipped the status); treat it like LOADING
    // so a render that lands in the remount gap NEVER shows a settled "connect DB" / "no results" message. The disconnect
    // message is reserved for a GENUINE unavailability (!_roUseDb — audited stable across remount, never a transient flip).
    if (_roBaseDataStatus === 'LOADING' || _roBaseDataStatus === 'IDLE') { _emptyMsg = '<div class="ro-empty-state ro-loading-state">Loading Request Order data…</div>'; _roLastEmptyReason = 'LOADING'; }
    else if (!_roUseDb()) {
      // F1-7N-FA-3C-R6C — only claim a DB disconnect on a GENUINE provider failure (KM.dbProvider state ERROR:
      // unconfigured / explicit mock). If the shared provider is READY but _roUseDb() is momentarily false (a transient),
      // show loading, never a false "Connect the Operation DB". The R6C root cause (scoped-cache poisoning that coerced
      // the source to 'mock') is fixed at the provider, so a READY provider now keeps _roUseDb() true across navigation.
      var _prov = (typeof window !== 'undefined' && window.KM && window.KM.dbProvider && typeof window.KM.dbProvider.state === 'function') ? window.KM.dbProvider.state() : 'ERROR';
      if (_prov === 'ERROR') { _emptyMsg = '<div class="ro-empty-state">No Request Order data available. Connect the Operation DB or enable Demo Data to view rows.</div>'; _roLastEmptyReason = 'DB_UNAVAILABLE'; }
      else { _emptyMsg = '<div class="ro-empty-state ro-loading-state">Loading Request Order data…</div>'; _roLastEmptyReason = 'PROVIDER_TRANSIENT'; }
    }
    else if (_roBaseDataStatus === 'ERROR') { _emptyMsg = '<div class="ro-empty-state ro-error-state">Could not load Request Order data. <button type="button" class="ro-alloc-retry" onclick="initRequestOrderSection()">Retry</button></div>'; _roLastEmptyReason = 'ERROR'; }
    else { _emptyMsg = '<div class="ro-empty-state">No results for the current scope. Adjust filters and press Search.</div>'; _roLastEmptyReason = 'EMPTY_SCOPE'; }
    if (fixedBody && scrollBody) { fixedBody.innerHTML = ''; scrollBody.innerHTML = _emptyMsg; }
    return;
  }

  let filteredData = _applyRequestOrderFilters(requestOrderState.data);

  // Show filter (Part 1): Confirmed / Pending filter rows by their site-confirmation state;
  // All / All Request show everything. No calculation — purely a view filter over confirmedSites.
  if (requestOrderState.showMode === 'confirmed') {
    filteredData = filteredData.filter(_roIsRowConfirmed);
  } else if (requestOrderState.showMode === 'pending') {
    filteredData = filteredData.filter(item => !_roIsRowConfirmed(item));
  }
  
  const fixedBody = document.getElementById('ro-fixed-body');
  const scrollBody = document.getElementById('ro-scroll-body');

  if (!fixedBody || !scrollBody) return;

  // Expanded-row reconciliation (2026-07-22): if the expanded SKU is no longer in the filtered
  // result, close it so a stale detail card from a previous SKU can never linger.
  if (requestOrderState.expandedRowKey &&
      !filteredData.some(function (it) { return _roRowKey(it) === requestOrderState.expandedRowKey; })) {
    requestOrderState.expandedRowKey = null;
  }

  // Filtered-empty state: source data exists but the active filters exclude every row.
  if (!filteredData.length) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="ro-empty-state">No matching SKUs</div>';
    _roRenderPagination(0, 1, 0, 0);
    return;
  }

  // ---- Pagination (Part 1): slice AFTER all filtering. Never render every row at once. ----
  const totalRows = filteredData.length;
  const pageSize = requestOrderState.pageSize || 25;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  if (requestOrderState.page > totalPages) requestOrderState.page = totalPages;
  if (requestOrderState.page < 1) requestOrderState.page = 1;
  const startIdx = (requestOrderState.page - 1) * pageSize;
  const pageData = filteredData.slice(startIdx, startIdx + pageSize);
  _roRenderPagination(totalRows, totalPages, startIdx, pageData.length);

  fixedBody.innerHTML = pageData.map(item => {
    const rowKey = _roRowKey(item);
    const isExpanded = requestOrderState.expandedRowKey === rowKey;
    const toggleCall = `toggleRequestOrderSkuExpand('${_roJs(item.sku)}','${_roJs(item.country)}','${_roJs(item.marketplace)}','${_roJs(item.company)}')`;
    const panelId = _roPanelId(rowKey);
    return `
    <div class="ro-fixed-wrapper" data-rowkey="${_roEsc(rowKey)}">
      <div class="fixed-row ${isExpanded ? 'is-expanded' : ''}" data-rowkey="${_roEsc(rowKey)}" role="row">
        <span class="ro-sku-expand-toggle ${isExpanded ? 'is-expanded' : ''}"
              role="button" tabindex="0"
              aria-expanded="${isExpanded ? 'true' : 'false'}" aria-controls="${panelId}"
              aria-label="Toggle detail for ${_roAttr(item.sku)}"
              onclick="${toggleCall}"
              onkeydown="if(event.key==='Enter'||event.key===' '||event.key==='Spacebar'){event.preventDefault();${toggleCall};}">
          ${isExpanded ? '▼' : '▸'}
        </span>
        ${item.sku}
      </div>
      ${isExpanded ? `
        <div class="ro-fixed-expand-spacer">
          <div class="ro-fixed-expand-actions">
            <button class="btn btn-secondary ro-btn-edit-target" onclick="handleEditTargetPct('${_roJs(item.sku)}','${_roJs(item.country)}','${_roJs(item.marketplace)}')">Edit Target %</button>
            <button class="btn btn-primary ro-btn-update-fc" onclick="handleFcUpdate('${_roJs(item.sku)}','${_roJs(item.country)}','${_roJs(item.marketplace)}')">FC Update</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
  }).join('');
  
  scrollBody.innerHTML = pageData.map(item => {
    const isPh = item._dbPlaceholder;

    // Suggested Order = calc placeholder. Only mock/demo rows carry a shortage-derived number;
    // live-DB (placeholder) rows show "--" until the calculation engine exists (Mapping v1).
    // F1-4B-FM5-R4UI-R5 §6A — the top Suggest Order is the MATERIALIZED actionable total from order_planning_gap:
    // t1 + t2 + t3 suggested (T1–T3 are the writable/actionable tiers; T4 is visibility-only, excluded from this
    // total). Read from the materialized cache when it exists (valid 0 → "0"); otherwise the legacy shortage-derived
    // placeholder. No blind T1–T4 sum, no client gap formula.
    let suggestDisplay = '--';
    var _matSug = _opMatSuggestedTotal_(item.sku);
    if (_matSug !== null) {
      suggestDisplay = _matSug > 0 ? _matSug.toLocaleString() : '0';
    } else if (!isPh) {
      const t1Order = item.shortageM1 < 0 ? Math.ceil(Math.abs(item.shortageM1) / item.boxSize) * item.boxSize : 0;
      const t2Order = item.shortageM2 < 0 ? Math.ceil(Math.abs(item.shortageM2) / item.boxSize) * item.boxSize : 0;
      const t3Order = item.shortageM3 < 0 ? Math.ceil(Math.abs(item.shortageM3) / item.boxSize) * item.boxSize : 0;
      const totalSuggestedOrder = t1Order + t2Order + t3Order;
      suggestDisplay = totalSuggestedOrder > 0 ? totalSuggestedOrder.toLocaleString() : '0';
    }

    const riskVal = item.risk == null ? '' : item.risk;
    const rowKey = _roRowKey(item);
    const isExpanded = requestOrderState.expandedRowKey === rowKey;

    return `
      <div class="ro-row-wrapper" data-rowkey="${_roEsc(rowKey)}" data-ro-sku="${_roEsc(item.sku)}">
        <div class="scroll-row" role="row">
          <!-- Risk 欄位 (placeholder until risk engine) -->
          <div class="scroll-cell scroll-cell--risk" data-risk="${riskVal}">${_roFmt(item.risk)}</div>
          <!-- Country 欄位 -->
          <div class="scroll-cell scroll-cell--country">${_roFmt(item.country)}</div>
          <!-- Marketplace 欄位 -->
          <div class="scroll-cell scroll-cell--marketplace">${_roFmt(item.marketplace)}</div>
          <!-- Upcoming FC 欄位 (2個) — Basic(T3) 起始群組邊界 -->
          <div class="scroll-cell ro-group-start">${_roFmt(item.basicFcT3)}</div>
          <div class="scroll-cell">${item.specialEventsFc == null ? '--' : (item.specialEventsFc > 0 ? item.specialEventsFc.toLocaleString() : '-')}</div>
          <!-- Inventory & Ongoing 欄位 (4個) — Site Stock 起始群組邊界；Site Stock 與 3rd Party 永遠分開顯示.
               (2026-07-24 cleanup) Site Stock shows the canonical quantity ONLY — Aging/DOS removed from
               Request Order; that concern lives on the Inventory Replenishment / 貨物庫存表 page. -->
          <div class="scroll-cell ro-group-start">${_roFmt(item.siteStock)}</div>
          <div class="scroll-cell">${_roFmt(item.thirdPartyStock)}</div>
          <div class="scroll-cell">${_roFmt(item.factoryStock)}</div>
          <div class="scroll-cell">${_roFmt(item.totalOngoingOrders)}</div>
          <!-- Coverage & Time 欄位 (2個): Remaining 起始群組邊界 (placeholder) / Lead Time (supplier_price_list) -->
          <div class="scroll-cell ro-group-start">${_roFmt(item.remaining)}</div>
          <div class="scroll-cell">${_roFmt(item.leadTime)}</div>
          <!-- Shortage 欄位 (3個) - 隱藏但保有篩選功能 -->
          <div class="scroll-cell" style="display:none;">${item.shortageM1 < 0 ? Math.abs(item.shortageM1).toFixed(0) : '0'}</div>
          <div class="scroll-cell" style="display:none;">${item.shortageM2 < 0 ? Math.abs(item.shortageM2).toFixed(0) : '0'}</div>
          <div class="scroll-cell" style="display:none;">${item.shortageM3 < 0 ? Math.abs(item.shortageM3).toFixed(0) : '0'}</div>
          <!-- Decision 欄位 (1個): Suggest Order 起始群組邊界 (Lead Time | Suggest Order); calc placeholder -->
          <div class="scroll-cell ro-request-order-cell ro-group-start">
            <span class="ro-request-order-value">${suggestDisplay}</span>
            <span class="ro-request-order-icon" title="Toggle detail" aria-hidden="true">⚙</span>
          </div>
        </div>
        ${isExpanded ? renderExpandPanel(item) : ''}
      </div>
    `;
  }).join('');
}

// Second-layer expand panel — Request Order Mapping v2 (Part 9). Clean v1 structure that works for
// ALL rows (DB or demo): four right-side detail panels. Real data is pulled where a source exists
// (Basic FC ← fc_regular_forecast; Upcoming Events ← fc_special_events); everything not yet sourced
// shows "--". NO formula (Recommendation Summary is structure only). Site Stock / 3rd Party are
// intentionally NOT duplicated here (they live in the main table).
function renderExpandPanel(item) {
  var sku = item.sku, country = item.country || '', marketplace = item.marketplace || '';
  var DB = (window.KM && window.KM.DB) || {};

  // fc_regular_forecast rows for this SKU + country + marketplace (one per year).
  var fcRows = ((DB.getFcRegularForecast && DB.getFcRegularForecast()) || []).filter(function(r) {
    return _roUpper(r.sku) === _roUpper(sku) &&
      (!r.country || !country || _roUpper(r.country) === _roUpper(country)) &&
      (!r.marketplace || !marketplace || _roLower(r.marketplace) === _roLower(marketplace));
  });
  function fcForMonth(mo) {
    var row = fcRows.filter(function(r) { return String(r.year) === String(mo.year); })[0] || fcRows[0];
    if (!row) return null;
    var v = parseFloat(row[mo.key]);
    return isNaN(v) ? null : v;
  }

  // Upcoming Events ← fc_special_events (canonical Special FC). Scope = COMPANY + country + marketplace
  // + sku (company added 2026-07-22 so KM never reads ResUS events for a shared SKU). Only valid,
  // non-deleted events. NO campaigns duplicate table, no regular-FC substitute, no fabricated 0.
  var company = item.company || '';
  // Scoped, active special events for this row. Bucketing is by PREPARATION-DATE month (Event Start − 30
  // days), the canonical monthly rule (SUPPLY_PLANNING_CALCULATION_RULES) — NOT the stored event_month.
  var scopedEvents = _roScopedActiveEvents({ sku: sku, company: company, country: country, marketplace: marketplace });

  var past3 = _roPastMonths(3);
  var next3 = _roNextMonths(3);

  // Block 1 — Past Achievement (FC Qty real when available; Actual/Sessions/USP/Rate not sourced → "--").
  var p1Rows = past3.map(function(mo) {
    return '<tr><td>' + mo.label + '</td><td>--</td><td>' + _roFmt(fcForMonth(mo)) + '</td><td>--</td><td>--</td><td>--</td></tr>';
  }).join('');

  // Block 2 — Forward Forecast MATRIX (B2, 2026-07-24): ONE table with grouped headers (Base FC vs
  // Special FC). Same month shown once (Month + Base cells span the month's event rows via rowspan, so
  // demand is never duplicated). Base FC = FC Qty + Target %; Special FC = Event / Event Date / Prep Date
  // / FC Qty and is ALWAYS 100% (never × Target%, never summed into Base). No special event that month →
  // the Special region shows "--". Multiple events in a month → one row each (name never lost). Underlying
  // Regular-FC / Special-FC mapping is unchanged; this is display grouping only.
  var ffRows = next3.map(function (mo) {
    var fcQty = fcForMonth(mo);
    var baseDisp = (fcQty == null) ? '--' : _roFmt(fcQty);
    var tgtDisp = (fcQty == null) ? '--' : (_roTargetPct(item, mo) + '%');
    var evs = _roEventsForPrepMonth(scopedEvents, mo);
    var span = Math.max(1, evs.length);
    var lead = '<td class="ff-month" rowspan="' + span + '">' + _roEsc(mo.label) + '</td>' +
               '<td class="ff-base" rowspan="' + span + '">' + baseDisp + '</td>' +
               '<td class="ff-base ff-base-end" rowspan="' + span + '">' + tgtDisp + '</td>';
    if (!evs.length) {
      return '<tr>' + lead +
        '<td class="ff-special ff-special-start">--</td><td class="ff-special">--</td>' +
        '<td class="ff-special">--</td><td class="ff-special">--</td></tr>';
    }
    return evs.map(function (ev, i) {
      var qtyDisp = (ev.qty > 0) ? ev.qty.toLocaleString() : '—';
      return '<tr>' + (i === 0 ? lead : '') +
        '<td class="ff-special ff-special-start">' + _roEsc(ev.name) + '</td>' +
        '<td class="ff-special">' + _roEsc(ev.start || '—') + '</td>' +
        '<td class="ff-special">' + _roEsc(ev.prep || '—') + '</td>' +
        '<td class="ff-special">' + qtyDisp + '</td></tr>';
    }).join('');
  }).join('');

  // Block 3a — Factory Stock (Factory / Current / Reserved / Available). No Warehouse column (Fix 4):
  // Factory display = warehouses.warehouse_name (join by warehouse_id); fallback warehouse_id, then "--".
  // No country on factory_stock → match by SKU. Available = current − reserved only when reserved present.
  var fsRows = ((DB.getFactoryStock && DB.getFactoryStock()) || []).filter(function(r) { return _roUpper(r.sku) === _roUpper(sku); });
  var whNameById = {};
  ((DB.getWarehouses && DB.getWarehouses()) || []).forEach(function(w) { if (w.warehouseId) whNameById[_roUpper(w.warehouseId)] = w.warehouseName || ''; });
  function _roFactoryName(r) {
    var nm = whNameById[_roUpper(r.warehouseId)];
    return nm || r.warehouseId || '--';
  }
  var factoryStockRows = fsRows.length ? fsRows.map(function(r) {
    var raw = r.raw || {};
    var hasReserved = raw.reserved_stock != null && raw.reserved_stock !== '';
    var reserved = hasReserved ? parseFloat(raw.reserved_stock) : null;
    var available = (hasReserved && !isNaN(reserved)) ? (r.currentStock - reserved) : null;
    return '<tr><td>' + _roFactoryName(r) + '</td><td>' +
      _roFmt(r.currentStock) + '</td><td>' + _roFmt(reserved) + '</td><td>' + _roFmt(available) + '</td></tr>';
  }).join('') : '<tr><td colspan="4" class="ro-expand-empty">No factory stock</td></tr>';

  // Block 3b — Factory Orders / In Production (Future 3 Months) — REAL purchase_orders ⋈ purchase_order_lines,
  // bucketed by line expected_completion_date (header fallback), cancelled/closure excluded. Current / Next /
  // Month-After-Next completion months. Scheduled = MAX(ordered − completed, 0); Completed = completed_qty.
  var foBySku = _roFactoryOrdersBySku(sku);
  var foMonths = _roMonthWindow(0, 3);
  var factoryOrderRows = foMonths.map(function(mo) {
    var rec = foBySku[_roYmKey(mo)];
    return '<tr><td>' + mo.label + '</td><td>' + (rec ? rec.scheduled.toLocaleString() : '--') + '</td><td>' + (rec ? rec.completed.toLocaleString() : '--') + '</td></tr>';
  }).join('');

  // ===== Block 3 — Recommendation Summary: Demand Summary (T1–T4) + Order Allocation (T1–T3) =====
  function _roYm(mo) { return mo.year + '-' + String(mo.idx + 1).padStart(2, '0'); }
  var edits = requestOrderState.allocEdits[_roAllocKey(item)] || {};
  var box = parseFloat(item.boxSize) || 0;
  var ev = item._engine || null;                 // canonical engine result (demo) — used only for the CMR line
  var firstShort = _roFirstShortageTier(item);
  var next4b = _roNextMonths(4);

  // F1-4B-FM3d: when the recommendation workspace is ON, the canonical server monthlyProjection (KMTPP) OWNS the
  // per-tier Gap + Suggested (and the recommendation-aware Demand). These cells render a "…"/existing-authority
  // placeholder synchronously and are patched by _opRecoPatchCanonicalCells when the async READ settles — NO
  // page-side gap/carton/suggested math. When OFF, the legacy demand-only + page-Suggested behavior is verbatim.
  var recoOn = (typeof _opRecoEnabled === 'function') && _opRecoEnabled();
  var recoProj = (recoOn && typeof _opRecoPrimaryProjectionFor === 'function') ? _opRecoPrimaryProjectionFor(item) : null;
  var recoLoading = (recoOn && typeof _opRecoIsLoadingFor === 'function') ? _opRecoIsLoadingFor(item) : false;
  function _roCanonTier(t) { if (!recoProj) return null; for (var ci = 0; ci < recoProj.length; ci++) { if (recoProj[ci].tier === t) return recoProj[ci]; } return null; }

  // A — Demand Summary (T1–T4). Legacy (workspace OFF): Demand = Adjusted Basic FC(month) + Special Event demand
  // (page authority). Canonical (workspace ON): Demand ← monthlyProjection.demandQty and Gap ← remainingGapQty
  // (the ONLY owner of monthly T1–T4 shortage; FM3d §2/§8). Missing month source → "--"/"—" (never a copied T3
  // value, never a fake 0). T1=Month+1 … T4=Month+4 (T4 = planning visibility only, never a Request Bucket).
  function _roDemandForMonth(mo) {
    var fc = fcForMonth(mo);
    var basic = (fc == null) ? null : Math.round(fc * (_roTargetPct(item, mo) / 100));
    var evs = _roEventsForPrepMonth(scopedEvents, mo);
    var special = evs.reduce(function (s, e) { return s + (e.qty > 0 ? e.qty : 0); }, 0);
    if (basic == null && !special) return null;
    return (basic || 0) + special;
  }
  var demandRows = ['T1', 'T2', 'T3', 'T4'].map(function (t, i) {
    var mo = next4b[i];
    var d = _roDemandForMonth(mo);
    var legacyStr = (d == null ? '--' : d.toLocaleString());
    if (!recoOn) return '<tr><td>' + t + ' · ' + mo.label + '</td><td>' + legacyStr + '</td></tr>';
    var ct = _roCanonTier(t);
    var demStr = (ct && ct.demandQty != null) ? Number(ct.demandQty).toLocaleString() : legacyStr;
    var gapStr = _opRecoFmtQty(ct ? ct.remainingGapQty : null, recoLoading);
    // F1-4B-FM5-R4UI-R5 §6B — Suggested column from the SAME materialized order_planning_gap tier
    // (t{1..4}_suggested_qty → canonical tier.suggestedOrderQty). All four tiers visible; T4 stays visibility-only
    // (never writable — this is a read-only display column, no input). No client calculation.
    var sugStr = _opRecoFmtQty(ct ? ct.suggestedOrderQty : null, recoLoading);
    return '<tr><td>' + t + ' · ' + mo.label + '</td>' +
      '<td data-ro-demand-tier="' + t + '">' + demStr + '</td>' +
      '<td data-ro-gap-tier="' + t + '">' + gapStr + '</td>' +
      '<td data-ro-suggested-tier="' + t + '">' + sugStr + '</td></tr>';
  }).join('');
  var demandHead = recoOn ? '<th>Tier · Month</th><th>Demand</th><th>Gap</th><th>Suggested</th>' : '<th>Tier · Month</th><th>Demand</th>';

  // B — Order Allocation (T1–T3 ONLY). Columns exactly: Tier/Month · Suggested · Order Qty · Carton · Note.
  // No visible Recommended column (the engine gap remains in runtime/audit). Order Qty defaults to Suggested;
  // manual partial carton is non-blocking; editing Order Qty never rewrites Suggested.
  var anySuggested = false;
  // F1-7N-FA-3C-R6B1 — per-SKU Order Allocation hydration state. Editable inputs appear ONLY when the Draft + token are
  // resolved (LOADED) or for an ordinary MANUAL SKU. LOADING → disabled skeleton (never a blank editable field);
  // NO_SAVED_DRAFT / DRAFT_CONFLICT / DRAFT_LOAD_ERROR → disabled + explicit state (never a Suggested→Order Qty fallback).
  var _allocState = (typeof _roDraftUiState_ === 'function') ? _roDraftUiState_(sku) : 'MANUAL';
  var _editable = (_allocState === 'DRAFT_LOADED' || _allocState === 'MANUAL');
  var _dis = _editable ? '' : ' disabled';
  var _stCls = (_allocState === 'DRAFT_LOADING') ? ' is-loading' : ((_allocState === 'DRAFT_CONFLICT' || _allocState === 'DRAFT_LOAD_ERROR') ? ' is-invalid' : '');
  var allocRows = ['T1', 'T2', 'T3'].map(function (t, i) {
    var mo = next3[i];
    var sug = _roTierSuggested(item, i);
    if (sug != null) anySuggested = true;
    var e = edits[t] || {};
    // DISPLAY value: a PERSISTED canonical-draft row shows its DB order_qty (reload authority, R4E3-PRE §10);
    // otherwise the frozen effective value. _roEffectiveOrderQty (the Send Request payload owner) is UNCHANGED.
    var eff = _roRowOrderQtyDisplay_(item, i, t, e);
    var cb = _roCartonBreak(eff == null ? '' : eff, box);
    // F1-7N-FA-3C-R6B — Note DISPLAY: a touched local edit wins (so typing/clearing is never clobbered by a re-render);
    // otherwise the PERSISTED canonical-draft note (reload authority). Blank local edit ('') deliberately shows blank.
    var noteRaw = (e.note !== undefined) ? String(e.note) : _roRowNoteDisplay_(item, t);
    var note = noteRaw.replace(/"/g, '&quot;');
    // R6B1 — during LOADING/NO_SAVED/CONFLICT/ERROR the editable fields are NOT populated (no blank-editable, no Suggested fallback).
    var qtyVal = (!_editable) ? '' : ((eff == null) ? '' : eff);
    var noteVal = (!_editable) ? '' : note;
    var cartonHtml = (_editable) ? _roCartonCellHtml(cb, box) : (_allocState === 'DRAFT_LOADING' ? '<span class="ro-muted">…</span>' : '<span class="ro-muted">--</span>');
    // FM3d: Suggested column ← canonical monthlyProjection.suggestedOrderQty when the workspace is ON (server
    // KMCALC carton owner; NO page-side carton math). Legacy page-Suggested only on the workspace-OFF fallback.
    var sugCell = recoOn
      ? '<td data-ro-suggested-tier="' + t + '">' + _opRecoFmtQty((_roCanonTier(t) ? _roCanonTier(t).suggestedOrderQty : null), recoLoading) + '</td>'
      : '<td>' + (sug == null ? '--' : sug.toLocaleString()) + '</td>';
    return '<tr><td>' + t + ' · ' + mo.label + '</td>' +
      sugCell +
      '<td><input type="number" min="0" step="1" class="ro-alloc-qty' + _stCls + '" value="' + qtyVal + '"' + _dis + ' ' +
        'data-sku="' + _roAttr(sku) + '" data-country="' + _roAttr(country) + '" data-marketplace="' + _roAttr(marketplace) + '" ' +
        'data-bucket="' + t + '" data-idx="' + i + '" data-box="' + box + '" data-field="qty" data-month="' + _roYm(mo) + '" onchange="_roAllocEdit(this)" oninput="_roRecomputeAllocRow(this)"></td>' +
      '<td class="ro-carton-cell" data-cell="carton">' + cartonHtml + '</td>' +
      '<td><input type="text" class="ro-alloc-note' + _stCls + '" value="' + noteVal + '"' + _dis + ' ' +
        'data-sku="' + _roAttr(sku) + '" data-country="' + _roAttr(country) + '" ' +
        'data-marketplace="' + _roAttr(marketplace) + '" data-bucket="' + t + '" data-field="note" data-month="' + _roYm(mo) + '" ' +
        'oninput="_roAllocEditNote(this)" onblur="_roAllocNoteFlush(this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}"></td></tr>';
  }).join('');
  // R6B1 — a compact, non-layout-shifting state banner ROW above the allocation rows for the non-editable states
  // (valid table markup: a colspan row, never a bare <div> between <tr>s).
  var _bannerTxt = (_allocState === 'DRAFT_LOADING') ? ['ro-alloc-state--loading', 'Loading saved allocation…']
    : (_allocState === 'NO_SAVED_DRAFT') ? ['ro-alloc-state--none', 'No saved allocation draft — run AI Plan to create one.']
    : (_allocState === 'DRAFT_CONFLICT') ? ['ro-alloc-state--conflict', 'Duplicate active draft — review required.']
    : (_allocState === 'DRAFT_LOAD_ERROR') ? ['ro-alloc-state--error', 'Could not load saved allocation. <button type="button" class="ro-alloc-retry" onclick="_roHydratePersistedDraftsForLoadedScopes_()">Retry</button>']
    : null;
  if (_bannerTxt) allocRows = '<tr class="ro-alloc-state-row ' + _bannerTxt[0] + '"><td colspan="5">' + _bannerTxt[1] + '</td></tr>' + allocRows;
  var firstShortBadge = (firstShort != null)
    ? '<span class="ro-first-shortage-badge">First Shortage: ' + RO_TIER_LABELS[firstShort] + ' · ' + next3[firstShort].label + '</span>'
    : '';
  // F1-4B-FM2B: when the canonical Recommendation Runtime is the active READ path, the "Recommendation —
  // Order Need" subsection below OWNS the recommendation surface — so the generic legacy "No recommendation
  // available." message is suppressed (it must never show alongside canonical lines). When the workspace is
  // OFF (kill switch), the legacy tier Suggested behavior is preserved verbatim.
  var allocEmpty = (anySuggested || _opRecoEnabled()) ? '' : '<div class="ro-rec-empty">No recommendation available.</div>';
  // §12 — a SKU the scope read-back reported as NO_DRAFT gets a restrained marker (execution row unavailable). This
  // NEVER recreates a second editable quantity authority: Order Qty edits for a non-canonical SKU stay in-memory
  // planning scratch (never persisted as a canonical draft) — the ordinary planning view, not an AI Plan execution row.
  var noDraftNote = (typeof _roIsNoDraftSku_ === 'function' && _roIsNoDraftSku_(item.sku))
    ? '<div class="ro-rec-nodraft" title="This SKU has no active AI Plan draft; run AI Plan to generate one.">No active AI Plan draft</div>' : '';

  // Incoming-supply empty state (F.6): no scheduled/completed across the next 3 months.
  var foHasData = foMonths.some(function (mo) { var rec = foBySku[_roYmKey(mo)]; return rec && (rec.scheduled > 0 || rec.completed > 0); });

  // Second-layer v6 — THREE decision blocks (D): (1) Achievement & Forecast · (2) Factory Supply ·
  // (3) Recommendation Summary. Each block is ONE card with clear internal subsections. Desktop widths
  // 34% / 30% / 36%; tablet: blocks 1–2 side-by-side, block 3 full row; mobile: single column.
  return `
    <div class="ro-sku-expand-panel is-open" id="${_roPanelId(_roRowKey(item))}" role="region" aria-label="Detail for ${_roAttr(item.sku)}" data-rowkey="${_roEsc(_roRowKey(item))}">
      <div class="ro-sku-expand-grid ro-sku-expand-grid--v6">

        <!-- Block 1 · Achievement & Forecast — Historical, then Current-Month Remaining Demand, then Basic FC
             and Special FC STACKED (full card width; no side-by-side subgrid). -->
        <div class="ro-sku-expand-card ro-block ro-block--forecast">
          <div class="ro-expand-card-title">Achievement &amp; Forecast</div>
          <div class="ro-block-sub">
            <div class="ro-subtitle">Historical Performance (Past 3 Months)</div>
            <table class="ro-expand-table"><thead><tr><th>Month</th><th>Achv %</th><th>FC Qty</th><th>Actual</th><th>Sessions</th><th>USP</th></tr></thead><tbody>${p1Rows}</tbody></table>
          </div>
          <div class="ro-block-sub">
            <div class="ro-fc-metric">Current Month Remaining Demand: <strong>${ev ? Math.round(ev.fcThisMonth).toLocaleString() : '--'}</strong></div>
            <div class="ro-subtitle">Forward Forecast · Base FC &amp; Special FC (Next 3 Months)</div>
            <table class="ro-expand-table ro-forward-fc-table">
              <thead>
                <tr>
                  <th rowspan="2" class="ff-month">Month</th>
                  <th colspan="2" class="ff-group ff-group-base">Base FC</th>
                  <th colspan="4" class="ff-group ff-group-special">Special FC</th>
                </tr>
                <tr>
                  <th>FC Qty</th><th class="ff-base-end">Target %</th>
                  <th class="ff-special-start">Event</th><th>Event Date</th><th>Prep Date</th><th>FC Qty</th>
                </tr>
              </thead>
              <tbody>${ffRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Block 2 · Factory Supply -->
        <div class="ro-sku-expand-card ro-block ro-block--supply">
          <div class="ro-expand-card-title">Factory Supply</div>
          <div class="ro-block-sub">
            <div class="ro-subtitle">Factory Inventory</div>
            <table class="ro-expand-table"><thead><tr><th>Factory</th><th>Current Stock</th><th>Reserved</th><th>Available</th></tr></thead><tbody>${factoryStockRows}</tbody></table>
          </div>
          <div class="ro-block-sub">
            <div class="ro-subtitle">Incoming Supply — Next 3 Months</div>
            ${foHasData
              ? `<table class="ro-expand-table"><thead><tr><th>Completion Month</th><th>Incoming (Scheduled)</th><th>Completed</th></tr></thead><tbody>${factoryOrderRows}</tbody></table>`
              : `<div class="ro-expand-empty ro-block-empty">No incoming supply in the next 3 months.</div>`}
          </div>
        </div>

        <!-- Block 3 · Recommendation Summary — Demand Summary (T1–T4) + Order Allocation (T1–T3) -->
        <div class="ro-sku-expand-card ro-block ro-block--recommend">
          <div class="ro-expand-card-title">Recommendation Summary ${firstShortBadge}</div>
          <div class="ro-block-sub">
            <div class="ro-subtitle">Demand Summary</div>
            <table class="ro-expand-table ro-demand-table"><thead><tr>${demandHead}</tr></thead><tbody>${demandRows}</tbody></table>
          </div>
          <div class="ro-block-sub">
            <div class="ro-subtitle">Order Allocation</div>
            ${noDraftNote}
            ${allocEmpty}
            <table class="ro-expand-table ro-rec-table"><thead><tr><th>Tier · Month</th><th>Suggested</th><th>Order Qty</th><th>Carton</th><th>Note</th></tr></thead><tbody>${allocRows}</tbody></table>
          </div>
          ${_opRecoSubsectionHtml(item)}
          ${typeof _roRecoActionHtml === 'function' ? _roRecoActionHtml(item) : ''}
        </div>
      </div>
    </div>
  `;
}

// Target % for a Basic-FC month: best-available fc_target_rules match → its % (month-specific if the
// rule carries jan_pct..dec_pct), else the rule's target_percentage, else 100 (placeholder). No complex
// priority logic (guardrail). mo = { idx, year }.
function _roTargetPct(item, mo) {
  var DB = (window.KM && window.KM.DB) || {};
  var rules = (DB.getFcTargetRules && DB.getFcTargetRules()) || [];
  if (!rules.length) return 100;
  var monKey = RO_MONTH_KEYS[mo.idx] + '_pct';
  function u(v) { return _roUpper(v); }
  var match = rules.filter(function(r) {
    var raw = r.raw || {};
    var scopeVal = r.scopeId || raw.sku || raw.series || raw.category || '';
    var scopeHit = u(scopeVal) === u(item.sku) || u(scopeVal) === u(item.series) || u(scopeVal) === u(item.category) ||
      u(raw.sku) === u(item.sku) || u(raw.series) === u(item.series) || u(raw.category) === u(item.category);
    if (!scopeHit) return false;
    if (r.company && item.company && u(r.company) !== u(item.company)) return false;
    if (r.country && item.country && u(r.country) !== u(item.country) && u(r.country) !== 'ALL') return false;
    if (r.marketplace && item.marketplace && _roLower(r.marketplace) !== _roLower(item.marketplace) && u(r.marketplace) !== 'ALL') return false;
    if (raw.year && mo.year && String(raw.year) !== String(mo.year)) return false;
    return true;
  })[0];
  if (!match) return 100;
  var raw = match.raw || {};
  if (raw[monKey] != null && raw[monKey] !== '') { var mp = parseFloat(raw[monKey]); if (!isNaN(mp)) return mp; }
  if (match.targetPercentage != null && !isNaN(match.targetPercentage)) return match.targetPercentage;
  return 100;
}

// Order Allocation local-state helpers (persisted on Send Request; see Part 3).
function _roAllocKey(item) { return (item.sku || '') + '|' + (item.country || '') + '|' + (item.marketplace || ''); }
function _roAttr(v) { return String(v == null ? '' : v).replace(/"/g, '&quot;'); }
function _roAllocEnsure(key) { if (!requestOrderState.allocEdits[key]) requestOrderState.allocEdits[key] = {}; return requestOrderState.allocEdits[key]; }
function _roAllocEdit(input) {
  var key = (input.dataset.sku || '') + '|' + (input.dataset.country || '') + '|' + (input.dataset.marketplace || '');
  var bucket = input.dataset.bucket;
  var rec = _roAllocEnsure(key);
  if (!rec[bucket]) rec[bucket] = {};
  var v = String(input.value);
  if (v === '') {
    rec[bucket].orderQty = '';                       // cleared → falls back to Suggested default
    input.classList.remove('is-invalid'); input.title = '';
  } else {
    var q = Number(v);
    if (isNaN(q) || q < 0) {                          // BLOCKING validation: negative / non-numeric
      input.classList.add('is-invalid');
      input.title = 'Order Qty must be a number ≥ 0.';
      // do NOT store an invalid value — the previous valid value is retained on Send
    } else {
      input.classList.remove('is-invalid'); input.title = '';
      rec[bucket].orderQty = q;                        // partial-carton (non-multiple) is allowed here
    }
  }
  rec[bucket].month = input.dataset.month || rec[bucket].month || '';
  _roRecomputeAllocRow(input);
  // R4E3-PRE: for a row backed by a PERSISTED canonical draft, persist this committed order_qty incrementally to
  // request_order_allocation_draft_lines via the EXISTING locked decision writer (onchange → one write per committed
  // value; no keystroke storm). NO_DRAFT / conflict rows keep the in-memory planning behavior above (never auto-create).
  if (rec[bucket].orderQty !== '' && rec[bucket].orderQty != null && _roIsCanonicalDraftSku_(input.dataset.sku)) {
    _roSaveOrderQtyToCanonicalDraft_(input.dataset.sku, bucket, rec[bucket].orderQty, input);
  }
}
// Live in-place refresh of the carton breakdown + partial warning for one Order-Qty row (no full
// re-render → never clears other unsaved edits; J.7). NON-blocking for partial cartons.
function _roRecomputeAllocRow(input) {
  var box = parseFloat(input.dataset.box) || 0;
  var cb = _roCartonBreak(input.value === '' ? '' : input.value, box);
  input.classList.toggle('is-invalid', input.value !== '' && !cb.isValid);
  var tr = (input.closest && input.closest('tr')) || null;
  if (!tr) return;
  var cartonCell = tr.querySelector('[data-cell="carton"]');
  if (cartonCell) cartonCell.innerHTML = _roCartonCellHtml(cb, box);   // partial warning now lives INSIDE the cell
}
// Carton-cell HTML for a computed breakdown (shared by render + live update). Shows Full Cartons + Loose
// Units + a Partial badge and the non-blocking warning INLINE (no separate per-row technical prose row).
function _roCartonCellHtml(cb, box) {
  if (!cb.isNumeric) return '<span class="ro-muted">--</span>';
  if (!cb.isValid) return '<span class="ro-invalid-tag">Invalid</span>';
  if (cb.boxUnknown || cb.full == null) return '<span class="ro-muted">carton size --</span>';
  var s = cb.full.toLocaleString() + ' ctn';
  if (cb.loose) s += ' + ' + cb.loose.toLocaleString() + ' loose';
  if (cb.isPartial) s += ' <span class="ro-partial-badge">Partial</span><span class="ro-partial-warn">⚠ Not a full-carton multiple</span>';
  return s;
}
// (2026-07-24) The per-row Reason prose was removed from the UI — the panel now shows only labels, values,
// carton breakdown, a compact partial warning, and a single First-Shortage badge. No _roBuildReason.
// F1-7N-FA-3C-R6B — Note edit → local state + DEBOUNCED autosave to the canonical Draft (no Save button). A blank note
// is a DELIBERATE empty-string replace (rec.note stays '' → the edit command sends note:''). oninput debounces; blur/
// Enter flush. For a NO_DRAFT/conflict SKU the note stays in-memory only (never a canonical write, never a new Draft).
function _roAllocEditNote(input) {
  var key = (input.dataset.sku || '') + '|' + (input.dataset.country || '') + '|' + (input.dataset.marketplace || '');
  var bucket = input.dataset.bucket;
  var rec = _roAllocEnsure(key);
  if (!rec[bucket]) rec[bucket] = {};
  rec[bucket].note = String(input.value == null ? '' : input.value);   // '' is a real value, not "omitted"
  if (typeof _roIsCanonicalDraftSku_ === 'function' && _roIsCanonicalDraftSku_(input.dataset.sku)) {
    _roAutosaveDebounce_(input, function () { _roSaveTierEditToCanonicalDraft_(input.dataset.sku, bucket, { note: rec[bucket].note }, input); });
  }
}
function _roAllocNoteFlush(input) {
  var key = (input.dataset.sku || '') + '|' + (input.dataset.country || '') + '|' + (input.dataset.marketplace || '');
  var bucket = input.dataset.bucket;
  var rec = _roAllocEnsure(key); if (!rec[bucket]) rec[bucket] = {};
  rec[bucket].note = String(input.value == null ? '' : input.value);
  if (typeof _roIsCanonicalDraftSku_ === 'function' && _roIsCanonicalDraftSku_(input.dataset.sku)) {
    _roAutosaveFlush_(input, function () { _roSaveTierEditToCanonicalDraft_(input.dataset.sku, bucket, { note: rec[bucket].note }, input); });
  }
}
// PERSISTED note projection for the Order Allocation Note field (reload authority): the canonical-draft tier note, else ''.
function _roRowNoteDisplay_(item, bucket) {
  var ref = _roCanonicalRowFor_(item && item.sku, bucket);
  return (ref && ref.line && ref.line.note != null) ? String(ref.line.note) : '';
}

function toggleRequestOrderSkuExpand(sku, country, marketplace, company) {
  _roToggleRowByKey(_roRowKey({ sku: sku, country: country, marketplace: marketplace, company: company }));
}

// Toggle a row's second layer by its composite row key, then re-sync the expand-panel heights.
function _roToggleRowByKey(rowKey) {
  if (rowKey == null) return;
  var _expanding = (requestOrderState.expandedRowKey !== rowKey);
  requestOrderState.expandedRowKey = (requestOrderState.expandedRowKey === rowKey) ? null : rowKey;
  // F1-7E-PREREQ-5: the first-layer is composer-sourced (no broad cache). The SECOND-layer expand surfaces
  // (forecast breakdown / Edit Target % / FC Update) read FC/factory/warehouse/PO facts. F1-7L: lazy-load ONLY
  // those bounded tables on the FIRST expand (KM.DB.refreshCacheTables — NOT the whole Operation DB), so the
  // panels keep working WITHOUT the retired startup prime and WITHOUT ever loading the whole DB.
  if (_expanding && _opUseFirstLayerComposer()) {
    _roEnsureL2Tables(false).then(function () { if (requestOrderState.expandedRowKey === rowKey) renderRequestOrderTable(); });
  }
  renderRequestOrderTable();
  // F1-4B-FM2: fire (or invalidate) the flag-gated, READ-ONLY Order-Planning recommendation read for the
  // newly-expanded row. One request per expanded scope; closing the row (or the feature OFF) invalidates +
  // aborts. Dedupe inside _opLoadRecommendation prevents a duplicate request on a subsequent table re-render.
  if (typeof _opLoadRecommendation === 'function') {
    var _opItem = (typeof _opRecoExpandedItem === 'function') ? _opRecoExpandedItem() : null;
    if (requestOrderState.expandedRowKey && _opItem) _opLoadRecommendation(_opItem);
    else _opRecoInvalidate('DISABLED');
  }
  // Sync heights after render with multiple attempts
  requestAnimationFrame(function () {
    syncExpandPanelHeights();
    setTimeout(syncExpandPanelHeights, 100);
  });
}

// ---- Whole-row expand (B1, 2026-07-24) ------------------------------------------------------------
// A single DELEGATED click/keydown listener per body container (they persist across re-render, so this
// is bound once — never per row). Clicking any NON-interactive part of a primary row toggles its second
// layer; native + ARIA controls, inputs and the row toolbar act on their own and never toggle. The
// disclosure arrow (role="button") keeps its own click + Enter/Space handler, so it is excluded here to
// avoid a double toggle. Clicks inside the expanded panel never collapse the row (the panel is a sibling
// of the primary row, so closest('.scroll-row'/'.fixed-row') is null there). Unsaved Order Qty / Note are
// kept in requestOrderState.allocEdits, so re-render restores them.
var RO_INTERACTIVE_TAGS = { BUTTON: 1, A: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, LABEL: 1, OPTION: 1 };
function _roIsInteractiveTarget(el, stopAt) {
  while (el && el !== stopAt && el.nodeType === 1) {
    if (RO_INTERACTIVE_TAGS[el.tagName]) return true;
    if (el.isContentEditable) return true;
    var role = el.getAttribute && el.getAttribute('role');
    if (role === 'button' || role === 'link' || role === 'checkbox' || role === 'radio' || role === 'textbox' || role === 'switch') return true;
    if (el.hasAttribute && el.hasAttribute('data-no-row-toggle')) return true;
    el = el.parentNode;
  }
  return false;
}
function _roBindRowExpandDelegation() {
  [['ro-fixed-body', '.fixed-row'], ['ro-scroll-body', '.scroll-row']].forEach(function (pair) {
    var container = document.getElementById(pair[0]);
    if (!container || container._roExpandBound) return;
    container._roExpandBound = true;
    var rowSel = pair[1];
    container.addEventListener('click', function (e) {
      if (_roIsInteractiveTarget(e.target, container)) return;          // controls/toolbar handle themselves
      var row = e.target.closest && e.target.closest(rowSel);           // only the PRIMARY row, never the panel
      if (!row || !container.contains(row)) return;
      var host = e.target.closest('[data-rowkey]');
      if (host) _roToggleRowByKey(host.getAttribute('data-rowkey'));
    });
    container.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var row = e.target.closest && e.target.closest(rowSel);
      if (!row || e.target !== row) return;                             // only when the row itself holds focus
      e.preventDefault();
      var host = row.closest('[data-rowkey]');
      if (host) _roToggleRowByKey(host.getAttribute('data-rowkey'));
    });
  });
}

function syncExpandPanelHeights() {
  if (!requestOrderState.expandedRowKey) return;

  // Only one row is expanded at a time, so the open panel + its fixed spacer are unique in the DOM.
  const scrollPanel = document.querySelector('.ro-sku-expand-panel.is-open');
  const fixedSpacer = document.querySelector('.ro-fixed-expand-spacer');

  if (scrollPanel && fixedSpacer) {
    const panelHeight = scrollPanel.offsetHeight;
    if (panelHeight > 0) {
      fixedSpacer.style.height = panelHeight + 'px';
    }
  }
}

// ============================================================================
// F1-4B-FM2 — Order Planning Recommendation READ cutover (recommendation.workspace.get; READ-ONLY).
// ----------------------------------------------------------------------------
// When the recommendation Workspace is EFFECTIVE (Foundation workspaceApiActive('recommendation')) AND the
// page-local Order-Planning opt-in is ON (BOTH default false), expanding a SKU row issues EXACTLY ONE
// scope-only recommendation.workspace.get for that row's company/country/marketplace/sku/siteSku, and
// renders the canonical destination lines in a NEW read-only "Recommendation — Order Need" subsection
// inside Block 3. It authors NO formula, recomputes nothing, imports no runtime module, performs NO write,
// triggers NO Send Request / Confirm Site / Submit, NEVER overwrites a manual Order Qty, and issues NO
// per-SKU HTTP loop and NO whole-DB reload. The Demand Summary stays demand-only and byte-unchanged. When
// either flag is OFF the subsection is omitted entirely and the legacy panel is preserved verbatim.
// Feature-gate rationale (F1-4B-FM2 §6): Order Planning shares the SINGLE 'recommendation' workspace flag
// with Inventory Replenishment (identical read endpoint + scope semantics → no redundant Foundation flag),
// but layers a page-local default-false opt-in so Order Planning can be enabled/verified INDEPENDENTLY of
// Inventory (turning Inventory's workspace flag on does NOT turn Order Planning on).
// F1-4B-FM2B PRODUCTION CUTOVER: Order Planning recommendation READ is now CANONICAL BY DEFAULT — it is
// active whenever the Foundation reports the recommendation workspace active (workspaceApiActive), which is
// itself default-on and master-flag-independent (single kill switch = KM.api.setWorkspaceEnabled). The old
// page-local opt-in NO LONGER GATES the feature (it could permanently block the canonical Runtime, which
// this round forbids). _opRecoOptIn is retained ONLY as an inert legacy field; _opSetRecommendationOptIn is
// a deprecated no-op shim kept for API stability, and _opGetRecommendationOptIn now reports the EFFECTIVE
// enabled state for the safe console diagnostic.
// __OPRECO_START__ (test extraction marker — do not remove)
var _opRecoOptIn = true;    // FM2B: inert legacy field (retained for API stability; no longer gates the feature)
var _opRecoSeq = 0;         // monotonic request sequence (stale-response guard)
var _opRecoAbort = null;    // AbortController for the in-flight request (browser response invalidation)
function _opRecoBlank(status) {
  return { status: status || 'DISABLED', scopeKey: null, sku: null, lines: [], requestId: null,
    errors: [], calcMonth: null, planningCycle: null, conflicts: 0, seq: _opRecoSeq, loadedOk: false };
}
var _opRecoState = _opRecoBlank('DISABLED');   // page-local read state (single slot — one row expands at a time)

// Effective predicate — SOLELY the Foundation recommendation Workspace active state (canonical default-on;
// FM2B removed the page-local opt-in gate so normal usage reaches the Runtime with no console command).
function _opRecoEnabled() {
  return !!(window.KM && window.KM.api && typeof window.KM.api.workspaceApiActive === 'function' &&
    window.KM.api.workspaceApiActive('recommendation'));
}
// DEPRECATED (FM2B): the opt-in no longer gates the feature. Retained as an inert no-op for API stability;
// the emergency kill switch is KM.api.setWorkspaceEnabled('recommendation', false) (shared with Inventory).
function _opSetRecommendationOptIn(on) { _opRecoOptIn = (on === true); return _opRecoEnabled(); }
// FM2B: canonical config codes that mean the server calculation-month is not configured/valid (distinct
// from a transport/API failure) — surfaced as CONFIG_NOT_READY with truthful wording, never a legacy state.
function _opRecoIsConfigCode(code) {
  return code === 'RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED' || code === 'RECOMMENDATION_CALCULATION_MONTH_INVALID';
}

// explicit null/undefined/'' → null (preserve a legitimate 0; NEVER value || 0).
function _opNumOrNull(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }

// The scope-only request identity for one expanded row. Requires the full business scope + SKU; null
// otherwise (surfaced honestly as CONTEXT_NOT_READY — never a guessed/partial scope). NO destination /
// month / cycle (the server owns those).
function _opRecoScopeFor(item) {
  if (!item) return null;
  var company = String(item.company == null ? '' : item.company).trim();
  var country = String(item.country == null ? '' : item.country).trim();
  var marketplace = String(item.marketplace == null ? '' : item.marketplace).trim();
  var sku = String(item.sku == null ? '' : item.sku).trim();
  if (!company || !country || !marketplace || !sku) return null;
  return { company: company, country: country, marketplace: marketplace, sku: sku,
    siteSku: (item.siteSku != null && item.siteSku !== '') ? String(item.siteSku) : null };
}
function _opRecoKey(scope) { return scope ? JSON.stringify(scope) : null; }

// Map ONE canonical destination-node API line → the fields the subsection renders (direct passthrough; no ||0).
function _opRecoMapLine(L) {
  L = L || {};
  return {
    recommendationLineId: L.recommendationLineId, recommendationMode: L.recommendationMode,
    sku: L.sku, siteSku: L.siteSku, destinationType: L.destinationType, destinationKey: L.destinationKey,
    destinationLabel: L.destinationLabel || L.destinationRefId || L.warehouseId || L.marketplaceId || null,
    warehouseId: L.warehouseId || null, marketplaceId: L.marketplaceId || null,
    allocatedForecastQty: _opNumOrNull(L.allocatedForecastQty),
    currentStockQty: _opNumOrNull(L.currentStockQty), qualifiedIncomingQty: _opNumOrNull(L.qualifiedIncomingQty),
    incomingCompleteness: (L.incomingCompleteness == null ? null : String(L.incomingCompleteness)),
    calculatedGap: _opNumOrNull(L.calculatedGap), allocatedSupplyQty: _opNumOrNull(L.allocatedSupplyQty),
    recommendedQty: _opNumOrNull(L.recommendedQty), provisionalOrderNeed: _opNumOrNull(L.provisionalOrderNeed),
    residualShortageQty: _opNumOrNull(L.residualShortageQty),
    blocked: L.blocked === true, blockedReason: (L.blockedReason == null ? null : String(L.blockedReason)),
    formulaVersion: (L.formulaVersion == null ? null : String(L.formulaVersion)),
    sourceDataAsOf: (L.sourceDataAsOf == null ? null : String(L.sourceDataAsOf)),
    // F1-4B-FM3d: additive per-tier monthly projection (server/KMTPP-owned). Direct passthrough (no || 0 — a
    // legitimate 0 is preserved; a missing tier field stays null so the UI renders "—", never a fabricated 0).
    monthlyProjection: Array.isArray(L.monthlyProjection) ? L.monthlyProjection.map(function (t) {
      t = t || {};
      return { tier: (t.tier == null ? null : String(t.tier)), month: (t.month == null ? null : String(t.month)),
        openingSupplyQty: _opNumOrNull(t.openingSupplyQty), incomingAddedQty: _opNumOrNull(t.incomingAddedQty),
        demandQty: _opNumOrNull(t.demandQty), coveredQty: _opNumOrNull(t.coveredQty),
        remainingSupplyQty: _opNumOrNull(t.remainingSupplyQty), remainingGapQty: _opNumOrNull(t.remainingGapQty),
        suggestedOrderQty: _opNumOrNull(t.suggestedOrderQty) };
    }) : null,
    diagnostics: (L.diagnostics && Array.isArray(L.diagnostics.issues)) ? L.diagnostics.issues.slice() : []
  };
}
// Apply a canonical envelope → state. Failure stays visible (never masked). Lines are filtered to the
// expanded SKU and kept DISTINCT per destination (MARKETPLACE and/or one per WAREHOUSE — never merged).
function _opRecoApplyEnvelope(env, scopeKey, scope) {
  if (!env || env.success !== true) {
    var errs = (env && Array.isArray(env.errors) && env.errors.length) ? env.errors
      : [{ code: 'WORKSPACE_ERROR', message: 'Recommendation workspace request failed.', details: null }];
    var isConfig = _opRecoIsConfigCode(errs[0] && errs[0].code);   // FM2B: distinct CONFIG_NOT_READY state
    _opRecoState = _opRecoBlank(isConfig ? 'CONFIG_NOT_READY' : 'API_ERROR');
    _opRecoState.scopeKey = scopeKey; _opRecoState.sku = scope && scope.sku;
    _opRecoState.errors = errs;
    _opRecoState.requestId = (env && env.meta && env.meta.requestId) || null;
    return;
  }
  var data = env.data || {};
  var raw = Array.isArray(data.lines) ? data.lines : [];
  var mapped = raw.map(_opRecoMapLine).filter(function (m) { return String(m.sku) === String(scope.sku); });
  _opRecoState = _opRecoBlank(raw.length ? (mapped.length ? 'READY' : 'NO_LINE') : 'EMPTY');
  _opRecoState.scopeKey = scopeKey; _opRecoState.sku = scope.sku; _opRecoState.lines = mapped;
  _opRecoState.requestId = (env.meta && env.meta.requestId) || null;
  _opRecoState.calcMonth = (env.meta && env.meta.calculationMonth) || null;
  _opRecoState.planningCycle = (env.meta && env.meta.planningCycle) || null;
  _opRecoState.conflicts = (env.meta && env.meta.conflicts) || 0;
  _opRecoState.loadedOk = true;
}
// Invalidate any in-flight request (bump seq + abort the browser response) and reset to a clean status.
function _opRecoInvalidate(status) {
  _opRecoSeq++;
  if (_opRecoAbort && _opRecoAbort.abort) { try { _opRecoAbort.abort(); } catch (e) {} }
  _opRecoAbort = null;
  _opRecoState = _opRecoBlank(status || 'DISABLED');
}
// ---- F1-4B-FM5-R1 · MATERIALIZED READ (order_planning_gap) — primary source; live is diagnostic/fallback ----
// Flag USE_MATERIALIZED_GAP_READ (default true) changes the READ SOURCE only. In materialized mode the expanded
// row READS the stored T1–T4 gap/suggested (NO recommendation.workspace.get, NO browser T-formula). Gated ALSO on
// the reader being present so the live-path tests (which stub only KM.api) keep exercising the fallback path.
function _opUseMaterializedGapRead() {
  if (typeof window !== 'undefined' && window.KM_FLAGS && typeof window.KM_FLAGS.USE_MATERIALIZED_GAP_READ === 'boolean') return window.KM_FLAGS.USE_MATERIALIZED_GAP_READ;
  return true;
}
function _opMaterializedReaderReady() { return !!(window.KM && window.KM.DB && typeof window.KM.DB.getOrderPlanningGap === 'function'); }
var _opMatCache = { key: null, bySku: {} };   // one scope (company/country/marketplace) cached; re-expand = no refetch
// Synthesize the frozen monthlyProjection line shape from ONE stored order_planning_gap row (verbatim; no math).
function _opMatToLine(row, scope) {
  var tiers = [['T1', 't1'], ['T2', 't2'], ['T3', 't3'], ['T4', 't4']];
  var mp = tiers.map(function (p) {
    return { tier: p[0], month: (row[p[1] + '_month'] != null && row[p[1] + '_month'] !== '' ? String(row[p[1] + '_month']) : null),
      openingSupplyQty: null, incomingAddedQty: null, demandQty: null, coveredQty: null, remainingSupplyQty: null,
      remainingGapQty: _opNumOrNull(row[p[1] + '_gap_qty']), suggestedOrderQty: _opNumOrNull(row[p[1] + '_suggested_qty']) };
  });
  return { recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: scope.sku, siteSku: scope.siteSku || null,
    destinationType: 'MARKETPLACE', destinationLabel: 'Order Planning', blocked: false, monthlyProjection: mp };
}
function _opLoadMaterializedGap(item) {
  var scope = _opRecoScopeFor(item);
  if (!scope) { _opRecoInvalidate('CONTEXT_NOT_READY'); _opRecoRerender(); return null; }
  var scopeKey = _opRecoKey(scope);
  if (_opRecoState.scopeKey === scopeKey && _opRecoState.loadedOk) return null;   // dedupe (re-render / re-expand)
  var mscope = { company: scope.company, country: scope.country, marketplace: scope.marketplace };
  var mkey = JSON.stringify(mscope);
  function applyFromCache() {
    var row = _opMatCache.bySku[String(scope.sku)] || null;
    if (!row) { _opRecoState = _opRecoBlank('NOT_CALCULATED'); }
    else { _opRecoState = _opRecoBlank('READY'); _opRecoState.lines = [_opMatToLine(row, scope)]; _opRecoState.calcMonth = row.calculation_month || null; }
    _opRecoState.scopeKey = scopeKey; _opRecoState.sku = scope.sku; _opRecoState.loadedOk = true; _opRecoRerender();
    _opRepaintSuggestOrderCells_();   // FM5-R4UI-R5 §6A: refresh the main-table top Suggest Order cells from the cache
  }
  if (_opMatCache.key === mkey) { applyFromCache(); return null; }
  var my = ++_opRecoSeq;
  _opRecoState = _opRecoBlank('LOADING'); _opRecoState.scopeKey = scopeKey; _opRecoState.sku = scope.sku; _opRecoState.seq = my;
  _opRecoRerender();
  return Promise.resolve(window.KM.DB.getOrderPlanningGap(mscope)).then(function (res) {
    if (my !== _opRecoSeq) return;
    if (!res || !res.success) { _opRecoState = _opRecoBlank('API_ERROR'); _opRecoState.scopeKey = scopeKey; _opRecoState.sku = scope.sku; _opRecoState.errors = [(res && res.error) || { code: 'READ_FAILED', message: 'materialized gap read failed' }]; _opRecoRerender(); return; }
    var rows = (res.data && res.data.rows) || [];
    var bySku = {}; rows.forEach(function (r) { if (r && r.sku != null) bySku[String(r.sku)] = r; });
    _opMatCache = { key: mkey, bySku: bySku };
    applyFromCache();
  }).catch(function (err) {
    if (my !== _opRecoSeq) return;
    _opRecoState = _opRecoBlank('API_ERROR'); _opRecoState.scopeKey = scopeKey; _opRecoState.sku = scope.sku;
    _opRecoState.errors = [{ code: 'READ_FAILED', message: String(err && err.message || err) }]; _opRecoRerender();
  });
}
// FM5-R4UI-R5 §6A — the top Suggest Order actionable total = materialized t1+t2+t3 suggested (READY only). T4 is
// visibility-only and excluded. Returns null when the SKU's row is absent / not READY / all three actionable
// values missing (→ the caller keeps its legacy placeholder). A valid 0+0+0 returns 0 (not null). No client math.
function _opMatSuggestedTotal_(sku) {
  var by = (_opMatCache && _opMatCache.bySku) || {}; var row = sku != null ? by[String(sku)] : null;
  if (!row || String(row.calculation_status) !== 'READY') return null;
  var any = false, total = 0;
  ['t1_suggested_qty', 't2_suggested_qty', 't3_suggested_qty'].forEach(function (k) { var v = _opNumOrNull(row[k]); if (v !== null) { total += v; any = true; } });
  return any ? total : null;
}
// Patch the main-table top Suggest Order cells in place from the materialized cache (no full re-render, no calc).
function _opRepaintSuggestOrderCells_() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  var wraps = document.querySelectorAll('.ro-row-wrapper[data-ro-sku]');
  Array.prototype.forEach.call(wraps, function (w) {
    var cell = w.querySelector('.ro-request-order-value'); if (!cell) return;
    var t = _opMatSuggestedTotal_(w.getAttribute('data-ro-sku'));
    if (t !== null) cell.textContent = t > 0 ? t.toLocaleString() : '0';
  });
}
function refreshOrderPlanningGapAfterRecalc_() { _opMatCache = { key: null, bySku: {} }; _opRecoInvalidate('LOADING'); var item = _opRecoExpandedItem(); if (item) _opLoadMaterializedGap(item); }
if (typeof window !== 'undefined') { window.refreshOrderPlanningGapAfterRecalc_ = refreshOrderPlanningGapAfterRecalc_; }

// The read: at most ONE scope-only recommendation.workspace.get per expanded row. Deduped, stale-guarded.
function _opLoadRecommendation(item) {
  // FM5-R1: materialized read is primary (when the reader exists) — expand is READ-ONLY, no live calculation.
  if (_opUseMaterializedGapRead() && _opMaterializedReaderReady()) return _opLoadMaterializedGap(item);
  if (!_opRecoEnabled()) { _opRecoInvalidate('DISABLED'); _opRecoRerender(); return null; }
  var scope = _opRecoScopeFor(item);
  if (!scope) { _opRecoInvalidate('CONTEXT_NOT_READY'); _opRecoRerender(); return null; }
  var scopeKey = _opRecoKey(scope);
  // dedupe: identical scope already loading or loaded → no duplicate request from a table re-render.
  if (_opRecoState.scopeKey === scopeKey && (_opRecoState.status === 'LOADING' || _opRecoState.loadedOk)) return null;
  if (!(window.KM && window.KM.api && typeof window.KM.api.getWorkspace === 'function')) {
    _opRecoInvalidate('API_ERROR'); _opRecoState.scopeKey = scopeKey; _opRecoState.sku = scope.sku;
    _opRecoState.errors = [{ code: 'WORKSPACE_UNAVAILABLE', message: 'Recommendation Workspace is enabled but the API client is unavailable.', details: null }];
    _opRecoRerender(); return null;
  }
  var my = ++_opRecoSeq;
  if (_opRecoAbort && _opRecoAbort.abort) { try { _opRecoAbort.abort(); } catch (e) {} }
  _opRecoAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var signal = _opRecoAbort ? _opRecoAbort.signal : undefined;
  _opRecoState = _opRecoBlank('LOADING'); _opRecoState.scopeKey = scopeKey; _opRecoState.sku = scope.sku; _opRecoState.seq = my;
  _opRecoRerender();
  var _t0 = (typeof Date !== 'undefined' && Date.now) ? Date.now() : null;   // client-latency stamp (diagnostic only)
  // ONE scope-only request for the expanded row (server expands destinations internally — no per-destination HTTP).
  var params = { scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: scope.sku, siteSku: scope.siteSku },
    filters: { sku: scope.sku, siteSku: scope.siteSku }, pagination: { page: 1, size: 100 }, include: { diagnostics: true } };
  return Promise.resolve(window.KM.api.getWorkspace('recommendation', params, { signal: signal })).then(function (env) {
    if (my !== _opRecoSeq) return;   // STALE_IGNORED — a newer expand superseded this response
    _opRecoRecordDiag(_t0);
    _opRecoApplyEnvelope(env, scopeKey, scope); _opRecoRerender();
  }).catch(function (err) {
    if (my !== _opRecoSeq) return;
    _opRecoRecordDiag(_t0);
    _opRecoState = _opRecoBlank('API_ERROR'); _opRecoState.scopeKey = scopeKey; _opRecoState.sku = scope.sku; _opRecoState.seq = my;
    _opRecoState.errors = [{ code: (err && err.apiCode) || 'PAGE_READ_FAILED', message: String(err && err.message || err), details: null }];
    _opRecoRerender();
  });
}
// F1-4B-FM2A: push the client-side latency for the Order-Planning consumer into the safe Foundation diagnostic
// (guarded — a no-op when the diagnostic recorder is absent, e.g. in unit tests with a stubbed api).
function _opRecoRecordDiag(t0) {
  if (t0 == null || !(window.KM && window.KM.api && typeof window.KM.api.recordRecommendationDiagnostic === 'function')) return;
  try { window.KM.api.recordRecommendationDiagnostic({ lastClientDurationMs: Date.now() - t0 }); } catch (e) {}
}
// ---- Presentation (READ-ONLY; distinguishes every state; no Send Request / Order-Qty write) ----------
function _opRecoModeLabel(mode) {
  if (mode === 'MARKETPLACE_ORDER_NEED') return 'Marketplace Order Need';
  if (mode === 'WAREHOUSE_REPLENISHMENT') return 'Warehouse Replenishment';
  return mode || '—';
}
function _opRecoDestRowHtml(line) {
  function esc(v) { return _roEsc(v == null ? '' : v); }
  function num(v) { return (v === null || v === undefined) ? '—' : esc(String(v)); }
  var status, statusCls, recCell;
  var reason = line.blockedReason ? ('<code>' + esc(line.blockedReason) + '</code>') : '';
  if (line.blocked) {
    if (line.incomingCompleteness === 'PARTIAL' || line.incomingCompleteness === 'UNAVAILABLE') {
      status = 'Partial incoming — provisional'; statusCls = 'is-partial';
      recCell = '<span class="op-reco__provisional">prov. ' + num(line.provisionalOrderNeed) + '</span>';
    } else { status = 'Blocked'; statusCls = 'is-blocked'; recCell = '—'; }
  } else if (line.recommendedQty === 0) {
    status = 'No order needed'; statusCls = 'is-zero'; recCell = '0';
  } else if (line.recommendedQty === null) {
    status = 'Unavailable'; statusCls = 'is-unavail'; recCell = '—';   // missing runtime output — surfaced, never recomputed
  } else {
    var short = (typeof line.residualShortageQty === 'number' && line.residualShortageQty > 0);
    status = short ? ('Source short by ' + num(line.residualShortageQty)) : 'OK';
    statusCls = short ? 'is-short' : 'is-ok'; recCell = num(line.recommendedQty);
  }
  var demand = (line.recommendationMode === 'MARKETPLACE_ORDER_NEED') ? line.calculatedGap : line.allocatedForecastQty;
  return '<tr class="' + statusCls + '">' +
    '<td>' + esc(line.destinationLabel) + '</td>' +
    '<td>' + esc(_opRecoModeLabel(line.recommendationMode)) + '</td>' +
    '<td class="ro-num">' + num(demand) + ' / ' + num(line.calculatedGap) + '</td>' +
    '<td class="ro-num">' + num(line.currentStockQty) + '</td>' +
    '<td class="ro-num">' + num(line.qualifiedIncomingQty) + (line.incomingCompleteness && line.incomingCompleteness !== 'COMPLETE' ? (' <em>(' + esc(line.incomingCompleteness) + ')</em>') : '') + '</td>' +
    '<td class="ro-num">' + recCell + '</td>' +
    '<td>' + esc(status) + '</td>' +
    '<td>' + reason + '</td>' +
    '</tr>';
}
function _opRecoDiagnosticsHtml(line) {
  if (!line) return '';
  var items = [];
  (line.diagnostics || []).forEach(function (d) {
    var code = (d && d.code) ? '<code>' + _roEsc(d.code) + '</code> ' : '';
    var msg = _roEsc((d && d.message) ? d.message : (typeof d === 'string' ? d : ''));
    items.push('<li>' + code + msg + '</li>');
  });
  if (!items.length) return '';
  return '<details class="op-reco__diag"><summary>Diagnostics</summary><ul>' + items.join('') + '</ul></details>';
}
// Inner body for one expanded row — rendered PURELY from _opRecoState (guarded so a stale other-SKU state
// never leaks into a freshly-expanded row).
function _opRecoInner(item) {
  function wrap(cls, inner) { return '<div class="op-reco ' + cls + '" role="status" aria-live="polite">' + inner + '</div>'; }
  var scope = _opRecoScopeFor(item);
  if (!scope) return wrap('op-reco--info', 'Recommendation unavailable — scope incomplete (need Company / Country / Marketplace / SKU). <code>CONTEXT_NOT_READY</code>');
  var st = _opRecoState;
  if (st.scopeKey !== _opRecoKey(scope)) return wrap('op-reco--loading', 'Calculating recommendation…');
  if (st.status === 'LOADING') return wrap('op-reco--loading', 'Calculating recommendation…');
  if (st.status === 'CONFIG_NOT_READY') {
    var ce = (st.errors && st.errors[0]) || { code: 'RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED' };
    var crid = st.requestId ? (' <span class="op-reco__reqid">[' + _roEsc(st.requestId) + ']</span>') : '';
    return wrap('op-reco--config', 'Recommendation configuration is incomplete: <code>' + _roEsc(ce.code || 'RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED') + '</code>. Ask an administrator to set RECOMMENDATION_CALCULATION_MONTH.' + crid);
  }
  if (st.status === 'API_ERROR') {
    var e = (st.errors && st.errors[0]) || { code: 'API_ERROR', message: 'Recommendation request failed.' };
    var rid = st.requestId ? (' <span class="op-reco__reqid">[' + _roEsc(st.requestId) + ']</span>') : '';
    return wrap('op-reco--error', 'Recommendation request failed: ' + _roEsc(e.message || '') + ' <code>' + _roEsc(e.code || 'API_ERROR') + '</code>' + rid);
  }
  if (st.status === 'EMPTY') return wrap('op-reco--info', 'No SKU matched the recommendation scope. <code>EMPTY</code>');
  if (st.status === 'NO_LINE') return wrap('op-reco--info', 'No recommendation line for this SKU in the current scope. <code>RECOMMENDATION_LINE_NOT_FOUND</code>');
  if (st.status === 'NOT_CALCULATED') return wrap('op-reco--info', 'Not calculated yet — run <strong>Recalculate All Sites</strong>. <code>NOT_CALCULATED</code>');
  if (st.status !== 'READY') return wrap('op-reco--info', 'Recommendation not loaded.');
  var rows = st.lines.map(_opRecoDestRowHtml).join('');
  var meta = [];
  if (st.calcMonth) meta.push('month: ' + _roEsc(st.calcMonth));
  if (st.planningCycle) meta.push('cycle: ' + _roEsc(st.planningCycle));
  if (st.requestId) meta.push('requestId: ' + _roEsc(st.requestId));
  var conflictNote = (st.conflicts > 0) ? '<div class="op-reco__conflict">Identity conflict: ' + _roEsc(String(st.conflicts)) + ' duplicate line(s) suppressed server-side. <code>RECOMMENDATION_LINE_IDENTITY_CONFLICT</code></div>' : '';
  var table = '<table class="ro-expand-table op-reco__table"><thead><tr>' +
    '<th>Destination</th><th>Mode</th><th class="ro-num">Demand / Gap</th>' +
    '<th class="ro-num">Stock</th><th class="ro-num">Incoming</th><th class="ro-num">Recommended</th><th>Status</th><th>Reason</th></tr></thead><tbody>' +
    rows + '</tbody></table>';
  return wrap('op-reco--ready', table + conflictNote + (meta.length ? ('<div class="op-reco__meta">' + meta.join(' · ') + '</div>') : '')) + _opRecoDiagnosticsHtml(st.lines[0]);
}
// F1-4B-FM3d — canonical monthlyProjection CONSUMERS for the business decision surface (Demand Summary Gap +
// Order Allocation Suggested). PRESENTATION ONLY: no gap/carry-forward/carton/suggested math (all server-owned).
// The primary per-tier projection = the monthlyProjection of the SINGLE loaded destination line that carries one
// (the MARKETPLACE case). Multiple lines (warehouse fanout) or none → null → truthful unavailable (never a
// page-side merge/pool, never a fabricated value).
function _opRecoPrimaryProjection() {
  var st = _opRecoState;
  if (!st || st.status !== 'READY' || !Array.isArray(st.lines)) return null;
  var withP = st.lines.filter(function (l) { return Array.isArray(l.monthlyProjection) && l.monthlyProjection.length; });
  return withP.length === 1 ? withP[0].monthlyProjection : null;
}
function _opRecoScopeMatches(item) { var s = _opRecoScopeFor(item); return !!(s && _opRecoState.scopeKey === _opRecoKey(s)); }
function _opRecoPrimaryProjectionFor(item) { return _opRecoScopeMatches(item) ? _opRecoPrimaryProjection() : null; }
function _opRecoIsLoadingFor(item) { return !_opRecoScopeMatches(item) || _opRecoState.status === 'LOADING'; }
function _opRecoTierIn(proj, tier) { if (!proj) return null; for (var i = 0; i < proj.length; i++) { if (proj[i].tier === tier) return proj[i]; } return null; }
// Canonical qty formatter: a finite number (INCLUDING 0) renders as-is; null/undefined → "…" while still loading,
// "—" once settled/unavailable. NEVER fabricates a 0, NEVER turns a 0 into a dash (FM3d §10 valid-zero contract).
function _opRecoFmtQty(v, loading) {
  if (v === null || v === undefined) return loading ? '…' : '—';
  var n = Number(v); return isFinite(n) ? n.toLocaleString() : '—';
}
// DOM patch (READ-ONLY presentation): rewrite ONLY the canonical Demand / Gap / Suggested cells in the expanded
// panel from the current read state. NEVER touches the Order Qty / Carton / Note inputs (user-owned; no reset,
// no focus loss). Demand is patched to the canonical value only when present (else the existing-authority value
// rendered at expand stays visible — FM3d §9). Keyed by tier identity (data-ro-*-tier), never row index.
function _opRecoPatchCanonicalCells(item) {
  if (typeof document === 'undefined' || !document.getElementById || !_opRecoEnabled()) return;
  var panel = document.getElementById(_roPanelId(_roRowKey(item)));
  if (!panel || typeof panel.querySelector !== 'function') return;
  var loading = _opRecoIsLoadingFor(item);
  var proj = _opRecoPrimaryProjectionFor(item);
  ['T1', 'T2', 'T3', 'T4'].forEach(function (tier) {
    var pt = _opRecoTierIn(proj, tier);
    var gap = panel.querySelector('[data-ro-gap-tier="' + tier + '"]');
    if (gap) gap.innerHTML = _opRecoFmtQty(pt ? pt.remainingGapQty : null, loading);
    var sug = panel.querySelector('[data-ro-suggested-tier="' + tier + '"]');
    if (sug) sug.innerHTML = _opRecoFmtQty(pt ? pt.suggestedOrderQty : null, loading);
    var dem = panel.querySelector('[data-ro-demand-tier="' + tier + '"]');
    if (dem && pt && pt.demandQty != null) dem.innerHTML = Number(pt.demandQty).toLocaleString();
  });
}
// The Block-3 subsection markup. Returns '' when the feature is OFF → the legacy panel is byte-unchanged.
function _opRecoHostId(item) { return 'op-reco-' + _roPanelId(_roRowKey(item)); }
function _opRecoSubsectionHtml(item) {
  if (!_opRecoEnabled()) return '';   // legacy panel preserved verbatim when the workspace kill switch is OFF
  // FM3d: the standalone "Recommendation — Order Need" DECISION table is retired. Its per-destination runtime
  // detail (status / recommended / blockedReason / requestId / cycle) is preserved ONLY as a COLLAPSED
  // diagnostics area — it is no longer the business-facing surface (that is now Demand Summary Gap + Order
  // Allocation Suggested, driven by monthlyProjection). Host id retained so the async re-render still patches it.
  return '<details class="ro-block-sub op-reco-block op-reco-diag">' +
    '<summary class="ro-subtitle op-reco-diag__summary">Recommendation diagnostics</summary>' +
    '<div class="op-reco-host" id="' + _roEsc(_opRecoHostId(item)) + '">' + _opRecoInner(item) + '</div></details>';
}
// The currently-expanded row item (only one row expands at a time), resolved from state.
function _opRecoExpandedItem() {
  var key = requestOrderState.expandedRowKey; if (!key) return null;
  var data = requestOrderState.data || [];
  for (var i = 0; i < data.length; i++) { if (_roRowKey(data[i]) === key) return data[i]; }
  return null;
}
// Re-render ONLY the open subsection host from the current read state (no table re-render → no focus loss,
// no Order-Qty input reset). No-op when the feature is OFF (no host in the DOM).
function _opRecoRerender() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  var item = _opRecoExpandedItem(); if (!item) return;
  var host = document.getElementById(_opRecoHostId(item));
  if (host) host.innerHTML = _opRecoInner(item);
  _opRecoPatchCanonicalCells(item);   // FM3d: patch Demand Summary Gap + Order Allocation Suggested from monthlyProjection
}
if (typeof window !== 'undefined') {
  window._opSetRecommendationOptIn = _opSetRecommendationOptIn;   // DEPRECATED (FM2B): inert, no longer gates
  window._opGetRecommendationOptIn = function () { return _opRecoEnabled(); };   // FM2B: reports EFFECTIVE enabled state (diagnostic)
  window._opRecoEnabled = _opRecoEnabled;
  window._opLoadRecommendation = _opLoadRecommendation;
}
// __OPRECO_END__ (test extraction marker — do not remove)

// ---- Second-layer modals (Part 9). Editable (2026-07-23): Edit Target % → canonical upsertFcTargetRule;
// FC Update → canonical importFcRegularForecastBatch. Both reuse the SAME write path as FC Summary
// (no Request-Order-only table, no localStorage). N+1..N+3 only; loading/empty/error/success states. ----
function _roOpenModal(title, bodyHtml, opts) {
  _roCloseModal();
  var overlay = document.createElement('div');
  overlay.className = 'ro-date-overlay ro-modal-overlay';
  overlay.onclick = _roCloseModal;
  document.body.appendChild(overlay);
  var modal = document.createElement('div');
  modal.className = 'ro-date-modal ro-modal';
  // opts.hideDefaultActions: the body supplies its own action buttons (e.g. Confirm Site = Save/Cancel),
  // so the default Close bar is suppressed.
  var defaultActions = (opts && opts.hideDefaultActions)
    ? ''
    : '<div class="ro-date-actions"><button onclick="_roCloseModal()">Close</button></div>';
  modal.innerHTML =
    '<div class="ro-date-modal-content">' +
      '<h3>' + _roEsc(title) + '</h3>' +
      bodyHtml +
      defaultActions +
    '</div>';
  document.body.appendChild(modal);
}
function _roCloseModal() {
  var m = document.querySelector('.ro-modal'); if (m) m.remove();
  var o = document.querySelector('.ro-modal-overlay'); if (o) o.remove();
}

// Re-render after a second-layer FC/Target write, keeping the currently expanded row open.
// F1-7L: canonical (composer) mode re-reads the bounded second-layer FC tables (KM.DB.refreshCacheTables,
// force) and then re-fetches the SCOPED first-layer composer (_opLoadFirstLayerComposer_ → _roRenderAll),
// which re-renders the table + the still-open expand from fresh data — NO whole Operation DB, and the first
// layer is refreshed by its canonical owner (the composer), NOT the legacy broad _buildRequestOrderRowsFromDb
// (which needs first-layer-only tables absent from the bounded set). Legacy path is unchanged.
// F1-7M-B2 · changedTables = the canonical table(s) the just-committed write ACTUALLY modified (Target% → fc_target_rules;
// FC → fc_regular_forecast). When the full L2 set is already primed (_roL2Ready) and the caller names the changed table,
// re-read ONLY that table instead of the whole 7-table _RO_L2_TABLES set — the other 6 are server-unchanged by the edit
// and stay validly cached, and the first-layer fact is re-read authoritatively by the composer. The bounded refresh is
// fired in the SAME wave as the composer (independent reads) and handed to the composer as its render gate, so the
// still-open expand panel renders only after the changed table's fresh value is in cache. Fallback (no named table / cache
// not yet primed) = the prior full-set force refresh, unchanged. Server stays authoritative — this narrows WHICH bounded
// reads run, never replaces a readback with a local guess.
function _roReloadAndRerender(changedTables) {
  if (_opUseFirstLayerComposer() && _opFirstLayerReady()) {
    var refreshP;
    if (changedTables && changedTables.length && _roL2Ready && window.KM && window.KM.DB && typeof window.KM.DB.refreshCacheTables === 'function') {
      refreshP = Promise.resolve(window.KM.DB.refreshCacheTables(changedTables)).catch(function () {});
    } else {
      refreshP = _roEnsureL2Tables(true);   // full L2 refresh (unchanged behavior) — same .catch-swallow error semantics
    }
    _opLoadFirstLayerComposer_(refreshP);   // composer fires in the same wave; its success render waits for refreshP
    return;
  }
  try { if (_roUseDb()) requestOrderState.data = _buildRequestOrderRowsFromDb(); } catch (e) { /* keep prior data */ }
  if (typeof renderRequestOrderTable === 'function') renderRequestOrderTable();
  requestAnimationFrame(function() { try { syncExpandPanelHeights(); } catch (e) {} });
}

// Collect N+1..N+3 editor inputs (id prefix + one input per month). blank = no change (null); otherwise a
// number ≥ 0 (throws on invalid). Throws if nothing changed. → [{ mo, val }].
function _roCollectEditInputs(prefix, months) {
  var edits = [], anyVal = false;
  months.forEach(function(mo, i) {
    var inp = document.getElementById(prefix + i);
    var raw = inp ? String(inp.value).trim() : '';
    if (raw === '') { edits.push({ mo: mo, val: null }); return; }
    var num = Number(raw);
    if (!isFinite(num) || num < 0) throw new Error('Invalid value for ' + mo.label + ' — enter a number ≥ 0 or leave blank.');
    edits.push({ mo: mo, val: num }); anyVal = true;
  });
  if (!anyVal) throw new Error('No changes entered.');
  return edits;
}

// Bind Cancel + Save on an editor modal. saveFn() must return a Promise (or throw on validation). Handles
// disabled-while-saving + loading / success / error status (no alert; no optimistic fake success).
// changedTables (F1-7M-B2): the canonical table(s) this modal's write mutates, forwarded to _roReloadAndRerender so the
// post-write readback re-reads only the changed table (bounded) instead of the full 7-table L2 set. Omitted → full refresh.
function _roBindEditModal(saveFn, changedTables) {
  var save = document.getElementById('ro-modal-save');
  var cancel = document.getElementById('ro-modal-cancel');
  if (cancel) cancel.addEventListener('click', _roCloseModal);
  if (!save) return;
  save.addEventListener('click', function() {
    var status = document.getElementById('ro-modal-status');
    if (status) { status.className = 'ro-modal-status'; status.textContent = ''; }
    var p;
    try { p = saveFn(); } catch (e) { if (status) { status.className = 'ro-modal-status is-error'; status.textContent = (e && e.message) || String(e); } return; }
    save.disabled = true; save.textContent = 'Saving…';
    if (status) { status.className = 'ro-modal-status is-info'; status.textContent = 'Saving…'; }
    p.then(function(res) {
      if (res && res.success === false) { save.disabled = false; save.textContent = 'Save'; if (status) { status.className = 'ro-modal-status is-error'; status.textContent = 'Save failed: ' + (res.error || 'unknown error'); } return; }
      if (status) { status.className = 'ro-modal-status is-success'; status.textContent = 'Saved.'; }
      _roReloadAndRerender(changedTables);
      setTimeout(_roCloseModal, 600);
    }).catch(function(err) {
      save.disabled = false; save.textContent = 'Save';
      if (status) { status.className = 'ro-modal-status is-error'; status.textContent = 'Save failed: ' + ((err && err.message) || err); }
    });
  });
}

// Canonical Target % write (per year in the N+1..N+3 window). Reuses upsertFcTargetRule. Round-trips the
// existing SKU-scope rule's target_rule_id (dedupe), seeds the other 11 months from the current effective
// target (no regression), overrides only the edited months. Scope = SKU + row marketplace + year.
function _roSaveTargetPct(item, edits) {
  var DB = (window.KM && window.KM.DB) || {};
  if (!DB.upsertFcTargetRule) throw new Error('Target rule write API not available.');
  var byYear = {};
  edits.forEach(function(e) { if (e.val == null) return; (byYear[e.mo.year] = byYear[e.mo.year] || []).push(e); });
  var years = Object.keys(byYear);
  if (!years.length) throw new Error('No changes entered.');
  var rules = (DB.getFcTargetRules && DB.getFcTargetRules()) || [];
  var payloads = years.map(function(yr) {
    var existing = rules.filter(function(r) {
      var raw = r.raw || {};
      var isSku = (r.scopeType === 'sku') || _roUpper(raw.scope_type) === 'SKU';
      if (!isSku) return false;
      var scopeVal = r.scopeId || raw.sku || '';
      if (_roUpper(scopeVal) !== _roUpper(item.sku) && _roUpper(raw.sku) !== _roUpper(item.sku)) return false;
      if (String(raw.year || '') !== String(yr)) return false;
      return item.marketplace ? (_roLower(r.marketplace) === _roLower(item.marketplace)) : (!r.marketplace);
    })[0];
    var payload = { scope_type: 'SKU', scope_id: item.sku, year: parseInt(yr, 10), marketplace: item.marketplace || '', category: '', series: '', sku: item.sku, actor: 'request-order' };
    if (existing && existing.ruleId) payload.target_rule_id = existing.ruleId;
    RO_MONTH_KEYS.forEach(function(mk, idx) { payload[mk + '_pct'] = _roTargetPct(item, { idx: idx, year: parseInt(yr, 10) }); });
    byYear[yr].forEach(function(e) { payload[RO_MONTH_KEYS[e.mo.idx] + '_pct'] = e.val; });
    payload.target_percentage = payload.jan_pct;
    return payload;
  });
  return payloads.reduce(function(chain, pl) { return chain.then(function() { return DB.upsertFcTargetRule(pl); }); }, Promise.resolve());
}

// Canonical Base FC write (per year). Reuses importFcRegularForecastBatch (business key year+company+
// country+marketplace+sku). Preserves the other 11 months from the existing row; sets only edited months.
function _roSaveFc(item, edits) {
  var DB = (window.KM && window.KM.DB) || {};
  if (!DB.importFcRegularForecastBatch) throw new Error('Regular forecast write API not available.');
  var fcRows = ((DB.getFcRegularForecast && DB.getFcRegularForecast()) || []).filter(function(r) {
    return _roUpper(r.sku) === _roUpper(item.sku) &&
      (!r.country || !item.country || _roUpper(r.country) === _roUpper(item.country)) &&
      (!r.marketplace || !item.marketplace || _roLower(r.marketplace) === _roLower(item.marketplace)) &&
      (!r.company || !item.company || _roUpper(r.company) === _roUpper(item.company));
  });
  var byYear = {};
  edits.forEach(function(e) { if (e.val == null) return; (byYear[e.mo.year] = byYear[e.mo.year] || []).push(e); });
  var years = Object.keys(byYear);
  if (!years.length) throw new Error('No changes entered.');
  var toWrite = years.map(function(yr) {
    var existing = fcRows.filter(function(r) { return String(r.year) === String(yr); })[0];
    var row = { sku: item.sku, year: parseInt(yr, 10), company: item.company || '', country: item.country || '', marketplace: item.marketplace || '' };
    RO_MONTH_KEYS.forEach(function(mk) { var v = existing ? existing[mk] : ''; row[mk] = (v === '' || v == null) ? '' : v; });
    byYear[yr].forEach(function(e) { row[RO_MONTH_KEYS[e.mo.idx]] = Math.round(e.val); });
    return row;
  });
  return DB.importFcRegularForecastBatch(toWrite, { forecastStatusDefault: 'draft', sourceDefault: 'request_order' });
}

// Edit Target % — editable N+1..N+3 (Month / Current / New). Writes to canonical fc_target_rules.
function handleEditTargetPct(sku, country, marketplace) {
  if (!_roUseDb()) { _roOpenModal('Edit Target %', '<p class="ro-modal-note">Target % editing requires the live Operation DB (Demo mode is read-only here).</p>'); return; }
  var item = _roFindItem(sku, country, marketplace);
  var next3 = _roNextMonths(3);
  var rowsHtml = next3.map(function(mo, i) {
    var cur = _roTargetPct(item, mo);
    return '<tr><td>' + mo.label + '</td><td>' + cur + '%</td><td><input type="number" min="0" step="1" class="ro-edit-input" id="ro-tgt-new-' + i + '" value="' + cur + '" aria-label="New Target % for ' + _roEsc(mo.label) + '"></td></tr>';
  }).join('');
  var body =
    '<div class="ro-modal-row"><span>SKU</span><strong>' + _roEsc(sku) + '</strong></div>' +
    '<div class="ro-modal-row"><span>Country / Marketplace</span><strong>' + _roEsc(country || '--') + ' / ' + _roEsc(marketplace || '--') + '</strong></div>' +
    '<table class="ro-expand-table ro-edit-table"><thead><tr><th>Month</th><th>Current Target %</th><th>New Target %</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '<p class="ro-modal-note">Writes to canonical <code>fc_target_rules</code> (same path as FC Summary). Applies to Base FC only — Special Event FC is never × Target%. Default 100% when no rule; leave blank for no change.</p>' +
    '<div class="ro-modal-status" id="ro-modal-status" role="status" aria-live="polite"></div>' +
    '<div class="ro-date-actions"><button type="button" class="btn" id="ro-modal-cancel">Cancel</button><button type="button" class="btn btn-primary" id="ro-modal-save">Save Target %</button></div>';
  _roOpenModal('Edit Target % (N+1 ~ N+3)', body, { hideDefaultActions: true });
  // F1-7M-B2: a Target% write mutates ONLY fc_target_rules → bounded post-write refresh of just that table.
  _roBindEditModal(function() { return _roSaveTargetPct(item, _roCollectEditInputs('ro-tgt-new-', next3)); }, ['fc_target_rules']);
}

// FC Update — editable N+1..N+3 Base FC (Month / Current / New). Writes to canonical fc_regular_forecast.
function handleFcUpdate(sku, country, marketplace) {
  if (!_roUseDb()) { _roOpenModal('FC Update', '<p class="ro-modal-note">Base FC editing requires the live Operation DB (Demo mode is read-only here).</p>'); return; }
  var DB = (window.KM && window.KM.DB) || {};
  var item = _roFindItem(sku, country, marketplace);
  var fcRows = ((DB.getFcRegularForecast && DB.getFcRegularForecast()) || []).filter(function(r) {
    return _roUpper(r.sku) === _roUpper(sku) &&
      (!r.country || !country || _roUpper(r.country) === _roUpper(country)) &&
      (!r.marketplace || !marketplace || _roLower(r.marketplace) === _roLower(marketplace));
  });
  var next3 = _roNextMonths(3);
  var rowsHtml = next3.map(function(mo, i) {
    var row = fcRows.filter(function(r) { return String(r.year) === String(mo.year); })[0];
    var v = row ? parseFloat(row[mo.key]) : NaN;
    var curDisp = isNaN(v) ? '--' : v.toLocaleString();
    var curVal = isNaN(v) ? '' : v;
    return '<tr><td>' + mo.label + '</td><td>' + curDisp + '</td><td><input type="number" min="0" step="1" class="ro-edit-input" id="ro-fc-new-' + i + '" value="' + curVal + '" placeholder="' + curDisp + '" aria-label="New Base FC for ' + _roEsc(mo.label) + '"></td></tr>';
  }).join('');
  var body =
    '<div class="ro-modal-row"><span>SKU</span><strong>' + _roEsc(sku) + '</strong></div>' +
    '<div class="ro-modal-row"><span>Country / Marketplace</span><strong>' + _roEsc(country || '--') + ' / ' + _roEsc(marketplace || '--') + '</strong></div>' +
    '<table class="ro-expand-table ro-edit-table"><thead><tr><th>Month</th><th>Current Base FC</th><th>New Base FC</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '<p class="ro-modal-note">Writes to canonical <code>fc_regular_forecast</code> (same batch path + business key as FC Summary). Base FC only; Special Event FC is separate. Integer ≥ 0; leave blank for no change.</p>' +
    '<div class="ro-modal-status" id="ro-modal-status" role="status" aria-live="polite"></div>' +
    '<div class="ro-date-actions"><button type="button" class="btn" id="ro-modal-cancel">Cancel</button><button type="button" class="btn btn-primary" id="ro-modal-save">Save Base FC</button></div>';
  _roOpenModal('FC Update (N+1 ~ N+3)', body, { hideDefaultActions: true });
  // F1-7M-B2: an FC write mutates ONLY fc_regular_forecast → bounded post-write refresh of just that table (the first-layer
  // Base FC fact is re-read authoritatively by the composer; this refresh serves the still-open second-layer expand panel).
  _roBindEditModal(function() { return _roSaveFc(item, _roCollectEditInputs('ro-fc-new-', next3)); }, ['fc_regular_forecast']);
}

// Site confirmation (Fix 1) — now DB-backed via request_order_site_confirmations. `confirmedSites` is
// rehydrated from the DB on each render (see _roLoadConfirmationsFromDb); demo mode stays in-memory.
// A confirmation covers a row when company/country/marketplace/series match ('All' or '' matches any).
function _roConfirmationCovers(c, item) {
  return (!c.company || c.company === 'All' || c.company === item.company)
    && (!c.country || c.country === 'All' || c.country === item.country)
    && (!c.marketplace || c.marketplace === 'All' || c.marketplace === item.marketplace)
    && (!c.series || c.series === 'All' || c.series === item.series);
}
// Bucket-agnostic (Show = Confirmed / Pending): row is confirmed if ANY confirmed record covers it.
function _roIsRowConfirmed(item) {
  return (requestOrderState.confirmedSites || []).some(function(c) {
    return c.status === 'confirmed' && _roConfirmationCovers(c, item);
  });
}
// Bucket-aware: is this row confirmed for a specific bucket (T1/T2/T3)? A record with no bucket covers
// every bucket (back-compat for legacy scope-only confirmations).
function _roIsRowConfirmedForBucket(item, bucket) {
  return (requestOrderState.confirmedSites || []).some(function(c) {
    return c.status === 'confirmed' && (!c.bucket || c.bucket === bucket) && _roConfirmationCovers(c, item);
  });
}
// Rehydrate confirmedSites from the DB (google-sheet mode). Maps normalized records → the frontend
// shape used by the gate / Show filter. No-op result is an empty array when the tab is absent.
function _roLoadConfirmationsFromDb() {
  var DB = (window.KM && window.KM.DB) || {};
  var recs = (DB.getRequestOrderSiteConfirmations && DB.getRequestOrderSiteConfirmations()) || [];
  requestOrderState.confirmedSites = recs.map(function(c) {
    return {
      company: c.company, country: c.country, marketplace: c.marketplace, series: c.series,
      bucket: c.bucket, status: c.status, planningCycle: c.planningCycle, note: c.note
    };
  });
}

// Next N months as YYYY-MM (planning months). Handles year wrap. e.g. Jul 2026 → 2026-08/09/10.
function _roFutureMonthValues(n) {
  var d = new Date(), y = d.getFullYear(), m = d.getMonth(), out = [];
  for (var i = 1; i <= n; i++) {
    var mm = m + i, yy = y + Math.floor(mm / 12), idx = ((mm % 12) + 12) % 12;
    out.push(yy + '-' + String(idx + 1).padStart(2, '0'));
  }
  return out;
}

// Confirm Site (Fix 1) — modal for site-level confirmation, now DB-backed. Company / Country are LOCKED
// (readonly, prefilled from the current data/filter scope). Marketplace + Series are selectable.
// Planning is by BUCKET (T1/T2/T3, each shown with its month) — Save writes ONE confirmation record per
// selected bucket per scope. "Confirm All" writes for every visible/eligible site scope. Status fixed
// `confirmed` (hidden). Persists to request_order_site_confirmations (demo = in-memory).
function openConfirmSiteModal() {
  var data = requestOrderState.data || [];
  var cf = requestOrderState.filters.country || [];
  var mf = requestOrderState.filters.marketplace || [];
  function opts(values, selected) {
    return '<option value="All"' + (selected === 'All' ? ' selected' : '') + '>All</option>' +
      _roDistinct(values).map(function(v) {
        return '<option value="' + _roEsc(v) + '"' + (v === selected ? ' selected' : '') + '>' + _roEsc(v) + '</option>';
      }).join('');
  }
  // Locked Company / Country: single distinct value when unambiguous, else "All".
  var companies = _roDistinct(data.map(function(i) { return i.company; }));
  var lockedCompany = companies.length === 1 ? companies[0] : 'All';
  var lockedCountry = cf.length === 1 ? cf[0]
    : (function() { var cs = _roDistinct(data.map(function(i) { return i.country; })); return cs.length === 1 ? cs[0] : 'All'; })();
  var defMarketplace = mf.length === 1 ? mf[0] : 'All';

  // Buckets T1/T2/T3 = next 1/2/3 months. value = bucket; data-month carries the YYYY-MM it maps to.
  var fm = _roFutureMonthValues(3);
  var bucketDefs = [{ b: 'T1', m: fm[0] }, { b: 'T2', m: fm[1] }, { b: 'T3', m: fm[2] }];
  var bucketChecks = bucketDefs.map(function(x) {
    return '<label class="ro-cs-month-item"><input type="checkbox" class="ro-cs-bucket" value="' + x.b +
      '" data-month="' + x.m + '" checked> ' + x.b + ' · ' + x.m + '</label>';
  }).join('');

  var body =
    '<div class="ro-modal-row"><label>Planning Bucket(s)</label>' +
      '<div class="ro-cs-months" id="ro-cs-buckets">' + bucketChecks + '</div></div>' +
    '<div class="ro-modal-row"><label>Company</label>' +
      '<input type="text" id="ro-cs-company" class="ro-modal-input" value="' + _roEsc(lockedCompany) + '" readonly></div>' +
    '<div class="ro-modal-row"><label>Country</label>' +
      '<input type="text" id="ro-cs-country" class="ro-modal-input" value="' + _roEsc(lockedCountry) + '" readonly></div>' +
    '<div class="ro-modal-row"><label>Marketplace</label>' +
      '<select id="ro-cs-marketplace" class="ro-modal-input">' + opts(data.map(function(i){return i.marketplace;}), defMarketplace) + '</select></div>' +
    '<div class="ro-modal-row"><label>Series</label>' +
      '<select id="ro-cs-series" class="ro-modal-input">' + opts(data.map(function(i){return i.series;}), 'All') + '</select></div>' +
    '<div class="ro-modal-row"><label class="ro-cs-all-label"><input type="checkbox" id="ro-cs-all"> ' +
      'Confirm All — apply to every visible site scope (ignores the Marketplace/Series above)</label></div>' +
    '<input type="hidden" id="ro-cs-status" value="confirmed">' +
    '<div class="ro-modal-row"><label>Note</label>' +
      '<input type="text" id="ro-cs-note" class="ro-modal-input" placeholder="Optional note"></div>' +
    '<div class="ro-modal-actions">' +
      '<button class="ro-btn ro-btn--secondary" onclick="_roCloseModal()">Cancel</button>' +
      '<button class="ro-btn ro-btn--primary" onclick="saveConfirmSite()">Save</button>' +
    '</div>';
  _roOpenModal('Confirm Site', body, { hideDefaultActions: true });
}

// Save Confirm Site → one record per (scope × bucket). Persists to request_order_site_confirmations
// (upsert by planning_cycle+company+country+marketplace+series+bucket). Demo mode = in-memory only.
// Does NOT create request_orders (Confirm Site ≠ Send Request).
async function saveConfirmSite() {
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  var bucketEls = document.querySelectorAll('#ro-cs-buckets .ro-cs-bucket:checked');
  var buckets = Array.prototype.map.call(bucketEls, function(el) {
    return { bucket: el.value, month: el.getAttribute('data-month') || '' };
  });
  if (!buckets.length) { alert('Please select at least one Planning Bucket (T1 / T2 / T3).'); return; }

  var status = val('ro-cs-status') || 'confirmed';
  var note = val('ro-cs-note');
  var series = val('ro-cs-series') || 'All';
  var confirmAll = !!(document.getElementById('ro-cs-all') && document.getElementById('ro-cs-all').checked);

  // Resolve the site scope(s) to confirm.
  var scopes = [];
  if (confirmAll) {
    var seen = {};
    _applyRequestOrderFilters(requestOrderState.data).forEach(function(item) {
      var sc = { company: item.company || 'All', country: item.country || 'All', marketplace: item.marketplace || 'All',
                 series: series === 'All' ? 'All' : (item.series || 'All') };
      var k = sc.company + '|' + sc.country + '|' + sc.marketplace + '|' + sc.series;
      if (seen[k]) return; seen[k] = 1;
      scopes.push(sc);
    });
    if (!scopes.length) { alert('No visible site scopes to confirm. Adjust filters and try again.'); return; }
  } else {
    scopes.push({ company: val('ro-cs-company') || 'All', country: val('ro-cs-country') || 'All',
                  marketplace: val('ro-cs-marketplace') || 'All', series: series });
  }

  // One confirmation record per (scope × bucket).
  var records = [];
  scopes.forEach(function(sc) {
    buckets.forEach(function(bk) {
      records.push({
        planning_cycle: (bk.month && bk.month.slice(0, 4)) || String(new Date().getFullYear()),
        company: sc.company, country: sc.country, marketplace: sc.marketplace, series: sc.series,
        bucket: bk.bucket, status: status, note: note
      });
    });
  });

  // Demo mode: in-memory only (no DB write). Mirror the DB shape so gates behave the same.
  if (!_roUseDb()) {
    records.forEach(function(r) {
      requestOrderState.confirmedSites.push({
        company: r.company, country: r.country, marketplace: r.marketplace, series: r.series,
        bucket: r.bucket, status: r.status, planningCycle: r.planning_cycle, note: r.note
      });
    });
    _roCloseModal();
    _roUpdateConfirmStatus();
    renderRequestOrderTable();
    alert('DEMO (in-memory only, NOT written to DB)\n\nSite confirmations: ' + records.length +
      ' record(s)\nBuckets: ' + buckets.map(function(b){return b.bucket;}).join(', ') +
      '\n\nLive mode writes to request_order_site_confirmations.');
    return;
  }

  // Live: persist to request_order_site_confirmations, then rehydrate from DB.
  try {
    var res = await window.KM.DB.upsertRequestOrderSiteConfirmations({ confirmations: records, confirmed_by: 'request-order' });
    _roLoadConfirmationsFromDb();
    _roCloseModal();
    _roUpdateConfirmStatus();
    renderRequestOrderTable();   // so Show = Confirmed / Pending reflects it
    alert('✅ Site Confirmed — ' + ((res && res.upserted) != null ? res.upserted : records.length) +
      ' record(s) saved to request_order_site_confirmations.\n\nBuckets: ' +
      buckets.map(function(b){return b.bucket;}).join(', ') +
      '\n\nConfirm Site ≠ Send Request — no Request Order created (spec §12.10).');
  } catch (err) {
    alert('Confirm Site 失敗：' + (err && err.message ? err.message : err) + '\n\n（未寫入 DB；請重試。）');
  }
}

// F1-7N-FA-3C-R6E-P0 — Site Confirm requirement, mirrored from the backend-owned flag via the KM.api Foundation
// (KM.api.requestOrderSiteConfirmRequired). FAIL-SAFE default TRUE: if the capability is unavailable, keep the ORIGINAL
// strict Site Confirm gate. When FALSE (the R6E controlled test), Send must NOT reject solely because Site Confirm is
// absent — every OTHER Send gate stays mandatory. Reversible: flip the flag back to true to restore the gate exactly.
function _roSiteConfirmRequired() {
  try { if (typeof window !== 'undefined' && window.KM && window.KM.api && typeof window.KM.api.requestOrderSiteConfirmRequired === 'function') return window.KM.api.requestOrderSiteConfirmRequired() === true; } catch (e) {}
  return true;
}
function _roUpdateConfirmStatus() {
  var el = document.getElementById('ro-confirm-status');
  if (!el) return;
  if (typeof _roSiteConfirmRequired === 'function' && !_roSiteConfirmRequired()) {
    // R6E — Site Confirm not required → remove the "No site confirmed yet" message + hide the status control entirely.
    el.textContent = ''; el.style.display = 'none'; el.className = 'ro-confirm-status';
    return;
  }
  el.style.display = '';
  var n = (requestOrderState.confirmedSites || []).filter(function(c) { return c.status === 'confirmed'; }).length;
  el.textContent = n ? (n + ' site scope(s) confirmed') : 'No site confirmed yet';
  el.className = 'ro-confirm-status' + (n ? ' is-confirmed' : '');
}

function syncRequestOrderScroll() {
  const scrollCol = document.getElementById('ro-scroll-col');
  const scrollHeader = document.getElementById('ro-scroll-header');
  
  if (!scrollCol || !scrollHeader) return;
  
  // Sync horizontal scroll between header and body
  scrollCol.addEventListener('scroll', function() {
    scrollHeader.style.transform = `translateX(-${this.scrollLeft}px)`;
  });
}

// Send Request gate (Fix 1): every distinct site scope (country / marketplace / series) in the current
// filtered scope must be confirmed FOR EVERY requested bucket. Send T1 requires all scopes confirmed
// for T1; Send T2/T3 likewise; All Request requires T1 AND T2 AND T3. Returns still-pending scope labels.
// Reads DB-backed confirmedSites (rehydrated per render). buckets = ['T1'] | ['T2'] | ['T3'] | ['T1','T2','T3'].
function _roUnconfirmedSites(buckets) {
  const need = (buckets && buckets.length) ? buckets : ['T1', 'T2', 'T3'];
  const rows = _applyRequestOrderFilters(requestOrderState.data);
  const seen = {}, missing = [];
  rows.forEach(item => {
    const key = (item.country || '') + '|' + (item.marketplace || '') + '|' + (item.series || '');
    if (seen[key]) return;
    seen[key] = 1;
    const allBuckets = need.every(function(b) { return _roIsRowConfirmedForBucket(item, b); });
    if (!allBuckets) {
      const label = (item.country || '--') + ' / ' + (item.marketplace || '--') +
        (item.series ? (' / ' + item.series) : '');
      missing.push(label);
    }
  });
  return missing;
}

// Buckets to include for the selected Request Type (all / t1 / t2 / t3).
function _roBucketsForType(t) {
  if (t === 't1') return ['T1'];
  if (t === 't2') return ['T2'];
  if (t === 't3') return ['T3'];
  return ['T1', 'T2', 'T3'];
}

// Bucket → its planning month object (T1 = next month … T3 = +3). Uses the same _roNextMonths(3) as the
// second-layer Order Allocation so month/bucket stay consistent between the table and the drafts.
function _roBucketMonthObj(bucket) {
  var n3 = _roNextMonths(3);
  return { T1: n3[0], T2: n3[1], T3: n3[2] }[bucket] || null;
}
// fc_regular_forecast for item + a given month (same source/priority as the second-layer Basic FC).
function _roFcForItemMonth(item, mo) {
  if (!mo) return null;
  var DB = (window.KM && window.KM.DB) || {};
  var rows = ((DB.getFcRegularForecast && DB.getFcRegularForecast()) || []).filter(function(r) {
    return _roUpper(r.sku) === _roUpper(item.sku) &&
      (!r.country || !item.country || _roUpper(r.country) === _roUpper(item.country)) &&
      (!r.marketplace || !item.marketplace || _roLower(r.marketplace) === _roLower(item.marketplace));
  });
  var row = rows.filter(function(r) { return String(r.year) === String(mo.year); })[0] || rows[0];
  if (!row) return null;
  var v = parseFloat(row[mo.key]);
  return isNaN(v) ? null : v;
}

// Send Request (Part 4): source = the Order Allocation edits (second-layer drafts). Only site-confirmed
// rows with a positive order_qty in the selected buckets are sent. Full-carton validation runs first.
// Live → persist allocation drafts + lines (with snapshots), create request_orders / request_order_lines
// (grouped by series; bucket PRESERVED per line — never merged), then mark drafts submitted.
// Demo → in-memory simulation only. NO shortage formula.
// F1-7N-FA-3C-R6A1 (G) — structured Send error message. Extracts a clean business message + the technical code/affected
// table from a canonical "PRODUCTION_SAFETY:<CODE> [table]" / leading-token error; NEVER renders "[object Object]".
// It makes NO "DB Draft retained" claim: a pre-write schema/gate/token failure wrote nothing (page inputs intact, safe
// to retry); a committed-unverified result explicitly says DO NOT retry + reload. Used by the Send catch below.
function _roSendErrorMessage_(err) {
  var raw = (err && err.message != null) ? String(err.message) : (typeof err === 'string' ? err : '');
  if (raw === '' || raw === '[object Object]') { try { raw = JSON.stringify(err); } catch (e) { raw = String(err); } }
  var m = raw.match(/PRODUCTION_SAFETY:([A-Z_]+)(?:\s*\[([^\]]+)\])?/);
  var code = m ? m[1] : (/^([A-Z_]{3,})/.test(raw) ? RegExp.$1 : 'SEND_FAILED');
  var table = (m && m[2]) ? m[2] : '';
  var business;
  if (/HEADER_MISSING|HEADER_ORDER_MISMATCH|SCHEMA|MISSING_REQUIRED_HEADER/.test(code)) {
    business = 'Send 無法完成：資料表結構不符（schema）。未寫入任何 Request Order，頁面輸入已保留，請聯繫維運確認後再試。';
  } else if (/DUPLICATE_CONFLICT/.test(code)) {
    business = 'Send 偵測到相同執行金鑰但內容不同（重複保護）。未重複建立，請重新載入後確認。';
  } else if (/COMMITTED_UNVERIFIED|RECONCILIATION/.test(code)) {
    business = 'Send 已送出但尚未確認完成 — 請勿重試。請重新載入頁面確認結果。';
  } else if (/TOKEN_MISMATCH|VERSION_CONFLICT|CONCURRENCY|IMMUTABLE_TERMINAL_STATUS|BLOCKED_CONFLICT/.test(code)) {
    business = 'Send 已停止：方案在您檢視後有變動。最新方案已重新載入，請確認後再送出。（未寫入任何 Request Order。）';
  } else {
    business = 'Send Request 失敗。頁面輸入已保留；請重新載入頁面確認是否已建立，再決定是否重試。';
  }
  var tech = 'Technical: ' + code + (table ? (' [' + table + ']') : '') + ((raw && raw !== code) ? (' — ' + raw) : '');
  return business + '\n\n▸ ' + tech;
}
window._roSendErrorMessage_ = _roSendErrorMessage_;



// ============================================================================================================
// F1-7N-FB-3A §E + ADDENDUM §4 — THE FROZEN WORKSET AND ITS HONEST DENOMINATORS.
// ------------------------------------------------------------------------------------------------------------
// WHERE "0/234" CAME FROM, exactly. The progress line read `allocation drafts 0/234`. That denominator was
// `drafts.length`, and `drafts` is built by iterating the FILTERED page rows and pushing ONE entry per SKU row
// that has at least one tier with orderQty > 0. So 234 was the number of SKU ROWS WITH A POSITIVE TIER
// QUANTITY, out of 495 AI-Plan rows on screen. It was NEVER a count of persisted
// `request_order_allocation_drafts`, and the user is right that the live table never held that many. The label
// was mine, introduced in FB-3, and it was simply wrong: I printed a SKU-row count under the word "drafts".
//
// An AI Plan row is NOT a persisted allocation draft. A row becomes a persisted draft only when this Send
// writes one (manual path) or when a canonical AI/job draft already exists for it (canonical path).
//
// The rules now enforced here:
//   • every count is computed ONCE, labelled with the unit it actually measures, and FROZEN;
//   • a phase denominator can never be a different unit from its phase's work item;
//   • the confirmation summary shows every count and every EXCLUSION with its reason before anything is written;
//   • counts are never mixed, summed across units, or relabelled.
var RO_SEND_UNITS_ = ['page_rows_in_scope', 'sku_rows_with_positive_tier', 'tier_cells_with_positive_qty',
    'distinct_skus', 'distinct_series', 'canonical_persisted_drafts', 'manual_drafts_to_create',
    'expected_request_order_headers', 'expected_request_order_lines'];
// Build the immutable count set for a Send. `drafts` is the per-SKU-row structure the caller already built.
function _roBuildWorkset_(drafts, bySeriesKeys, excluded, tierScope) {
    var tierCells = 0, skuSet = {}, seriesSet = {}, canonical = 0, manual = 0, lines = 0;
    for (var i = 0; i < drafts.length; i++) {
        var d = drafts[i];
        tierCells += d.lines.length;
        lines += d.lines.length;
        skuSet[String(d.item.sku)] = 1;
        seriesSet[String(d.item.series || '(no series)')] = 1;
        if (d.isCanonical) canonical++; else manual++;
    }
    var counts = {
        tier_scope: tierScope,
        page_rows_in_scope: excluded.rows_in_scope,
        sku_rows_with_positive_tier: drafts.length,
        tier_cells_with_positive_qty: tierCells,
        distinct_skus: Object.keys(skuSet).length,
        distinct_series: Object.keys(seriesSet).length,
        canonical_persisted_drafts: canonical,
        manual_drafts_to_create: manual,
        expected_request_order_headers: bySeriesKeys.length,
        expected_request_order_lines: lines,
        excluded: excluded
    };
    // Freeze so a later phase cannot mutate a denominator mid-run.
    try { Object.freeze(counts); Object.freeze(counts.excluded); } catch (e) {}
    return counts;
}
// Phase progress with an IMMUTABLE denominator and a unit-accurate label. The unit must be one of
// RO_SEND_UNITS_ so a phase can never advertise a count of something it is not iterating.
function _roSendPhase_(phase, done, total, unitLabel) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    _roSetSendState_('LOADING', phase + ' ' + done + '/' + total + ' ' + unitLabel + ' (' + pct + '%) — do not close this page.');
}
window._roBuildWorkset_ = _roBuildWorkset_;
window._roSendUnits_ = function () { return RO_SEND_UNITS_.slice(); };

// ============================================================================================================
// F1-7N-FB-3 §D/§F — SEND REQUEST: bounded, latched, always terminal.
// ------------------------------------------------------------------------------------------------------------
// THE LIVE DEFECT. Send Request "waited a long time, produced no visible result, and the DB was unchanged".
// Source-proven, that is four separate faults compounding — none of them a business rule:
//   1. NO LATCH AND NO LOADING STATE. handleSendRequest disabled nothing, set no busy state, and had no
//      `finally`. The button element did not even carry an id. For the entire duration the page was
//      indistinguishable from frozen, and a second click started a SECOND full run.
//   2. A SERIAL MULTI-WRITE LOOP with no progress. Send performs 2-3 sequential HTTP writes PER SKU
//      (allocation-draft header, a concurrency-token read, allocation lines), then one per series, then one
//      lifecycle advance. Twenty SKUs is well over forty sequential Apps Script round trips.
//   3. A WHOLE-DB RELOAD PER WRITE. Every direct writer awaits _kmWriterPostWrite_, which falls back to
//      loadOperationDb({force:true}) whenever the scoped posture cannot be confirmed — so on such a session the
//      loop performed one whole-DB read AFTER EVERY ONE of those writes. This is the dominant cost when it
//      happens, and it is invisible from the outside.
//   4. NO CLIENT TIMEOUT. An unanswered request never settled, so the await never returned and (with no latch
//      to release) the page stayed in that state indefinitely.
// Fixes 1 and 2's feedback live here; 3 is collapsed to ONE reconcile via the declared write batch; 4 is fixed
// at the transport choke points in operation-system-db-api.js.
//
// WHAT IS DELIBERATELY NOT DONE: the serial per-SKU writes are NOT auto-retried and NOT collapsed into a new
// batch endpoint. A batch write endpoint would be a second writer for these tables, and retrying a business
// write automatically is only safe with an explicit server-side idempotency contract. Both are reported, not
// improvised.
var _roSendState = { busy: false, mountSeq: 0, requestId: '', startedAt: 0 };
function _roSendBtn_() {
  return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('ro-send-request-btn') : null;
}
// The one visible progress/terminal surface for Send. Created next to the button; never on <body>.
function _roSendStatusHost_() {
  if (typeof document === 'undefined' || !document.getElementById) return null;
  var el = document.getElementById('ro-send-request-status');
  if (el) return el;
  var btn = _roSendBtn_();
  if (!btn || !btn.parentNode) return null;
  el = document.createElement('div');
  el.id = 'ro-send-request-status';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.style.fontSize = '12px';
  el.style.marginTop = '4px';
  el.style.display = 'none';
  btn.parentNode.appendChild(el);
  return el;
}
function _roEsc2_(v) {
  return (typeof _roEsc === 'function') ? _roEsc(v)
    : String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; });
}
// state: IDLE | LOADING | SUCCESS | ERROR. Every path ends in one of the last three — never in LOADING.
function _roSetSendState_(state, text) {
  var btn = _roSendBtn_();
  if (btn) {
    btn.disabled = (state === 'LOADING');
    btn.classList.remove('is-loading', 'is-success', 'is-error');
    if (state === 'LOADING') btn.classList.add('is-loading');
    else if (state === 'SUCCESS') btn.classList.add('is-success');
    else if (state === 'ERROR') btn.classList.add('is-error');
    btn.setAttribute('aria-busy', state === 'LOADING' ? 'true' : 'false');
  }
  var el = _roSendStatusHost_();
  if (!el) return;
  if (state === 'IDLE') { el.style.display = 'none'; el.innerHTML = ''; return; }
  var color = state === 'ERROR' ? '#B91C1C' : (state === 'SUCCESS' ? '#166534' : '#64748B');
  el.innerHTML = '<span style="color:' + color + ';">' + _roEsc2_(text || '') + '</span>';
  el.style.display = '';
}
// F1-7N-FB-3A §E — the FB-3 _roSendProgress_ helper is REMOVED. Its caller passed a SKU-row count under the
// label 'allocation drafts', which is exactly how '0/234 allocation drafts' was printed for a table that never
// held 234 drafts. Progress now goes through _roSendPhase_, whose denominators come from the FROZEN workset and
// whose labels name the unit actually being iterated.
// Compact instrumentation. Never logs a business row or any configuration value.
function _roSendTrace_(fields) {
  try {
    var line = { request_id: _roSendState.requestId, action: 'sendRequest' };
    for (var k in fields) { if (Object.prototype.hasOwnProperty.call(fields, k)) line[k] = fields[k]; }
    console.info('[ro-send]', JSON.stringify(line));
  } catch (e) {}
}
function _roSendRequestId_() {
  var r = 'ROSEND-';
  for (var i = 0; i < 8; i++) r += '0123456789ABCDEF'[Math.floor(Math.random() * 16)];
  return r;
}
window._roSendState_ = function () { return _roSendState; };
window._roSetSendState_ = _roSetSendState_;

// ============================================================================================================
// F1-7N-FB-3B §B/§C/§D/§E — SEND REQUEST: ONE CLICK, ONE SERVER ORCHESTRATION.
// ------------------------------------------------------------------------------------------------------------
// WHAT CHANGED, AND WHY THE CLIENT SAGA HAD TO GO. FB-3 latched the button, phased the progress and bounded the
// transport; FB-3A froze the counts and named the labels. Both were true improvements to a fundamentally wrong
// shape, and FB-3A said so: §G was left unimplemented and the browser still owned the business transaction.
// Three structural defects survived every client-side fix:
//
//   1. THE WORKSET WAS A VIEW, SO DISPLAY CONTROLS TRUNCATED A BUSINESS COMMAND. Send built its rows from
//      _applyRequestOrderFilters, which filters by Category tab, Risk and SKU search — and the Country and
//      Marketplace selections besides. A user who typed three characters into SKU search and pressed "All
//      Request" sent three SKUs and was told the Send had succeeded. FB-3A surfaced the truncation as a count
//      and asked for a decision; FB-3B has that decision (§B, user-frozen) and DELETES the filtering.
//   2. PROGRESS WAS OWNED BY A BROWSER TAB. Navigating, closing the tab or hitting the transport bound
//      mid-loop left the lifecycle half-advanced with no server record of what was intended.
//   3. QUANTITY AUTHORITY WAS ASSERTED, NOT PROVEN. The loop trusted its own in-memory map.
//
// THE USER-FROZEN SCOPE RULE (§B). The ONLY BUSINESS_SEND_SCOPE control is the request type:
//     ALL = the complete current eligible allocation population across ALL applicable countries, marketplaces
//           and tiers · T1 / T2 / T3 = the complete current eligible population of that tier, across all
//           countries and marketplaces.
//   Country, Marketplace, Category, Risk, Show mode, SKU search, pagination, the current visible page and
//   expanded/collapsed state are DISPLAY_ONLY and MUST NOT truncate the Send. This is intentional: Send
//   Request is a comprehensive one-time task, not a per-row selection.
//
// HOW THAT IS NOW STRUCTURAL RATHER THAN A PROMISE. The server builds the workset from the PERSISTED allocation
// drafts (66_ rosBuildWorkset_, which accepts no country / marketplace / category / risk / sku parameter at
// all). This page no longer supplies the population — it supplies the TIER SCOPE and its asserted quantities.
// A display filter cannot narrow a set it does not participate in producing, and re-adding one here could not
// narrow the Send even if someone tried.
//
// THE §C LIFECYCLE. AI Plan quantities are DEFAULTS. The authority is the latest SUCCESSFULLY PERSISTED
// user-edited quantity, and a Send never creates a draft from a raw AI Plan row and immediately sends it:
//     AI Plan / materialization -> persisted canonical draft -> user edits persisted through the canonical
//     writer -> scoped read-after-write verification -> frozen checksum + workset -> Send orchestration
// Before anything is written this handler flushes every pending edit AND WAITS for it, and the server then
// re-reads every affected draft and refuses the WHOLE Send if any asserted quantity is unsaved, missing or
// drifted. A prior DB quantity is never silently substituted for a newer edit that failed to save.
//
// THE §C CANONICAL CONFLICT — REPORTED, NOT HIDDEN. R4E5B used to create a DETERMINISTIC MANUAL draft
// ('RAD-M-…') for a never-materialized SKU inside the Send transition. That contradicted the standing rule
// "AI Plan remains the draft-creation boundary" AND the live flat-V2 deterministic identity
// ('RD::MONTHLY_ORDER::<YYYY-MM>::…'), under which a 'RAD-M-…' row is not the canonical draft for its scope at
// all. §C settles it: the workset is PERSISTED CANONICAL DRAFTS ONLY, so that create-inside-Send step is
// RETIRED. The consequence is real and is stated in the confirmation dialog rather than buried: a SKU that has
// never been materialized is no longer sendable in one click.
//
// PROGRESS AND NAVIGATION. There is no per-SKU write loop left to report, so progress is PHASE-based over the
// server's own phases. Navigating away can no longer cancel or own business progress: the orchestration is
// already running on the server, keyed by an execution key, and a late response is discarded for RENDERING
// only — never treated as "nothing happened".
// ============================================================================================================

// §B — the tier scope, and the ONLY mapping from a page control to a business scope value.
function _roSendTierScope_(requestType) {
  var t = String(requestType == null ? '' : requestType).trim().toLowerCase();
  return (t === 't1' || t === 't2' || t === 't3') ? t.toUpperCase() : 'ALL';
}

// §B — THE SEND SCOPE ROW UNIVERSE. Deliberately `requestOrderState.data` UNFILTERED.
// It does NOT consult, and must never consult: requestOrderState.filters.country, .marketplace, .risk, .sku,
// requestOrderState.categoryTab, requestOrderState.showMode, the pagination state or any expanded-row state.
// _applyRequestOrderFilters is the DISPLAY authority and is intentionally not called here. These page rows are
// used ONLY to compute the user's asserted quantities and the page-side candidate counts — the population that
// is actually sent is the server's, built from persisted drafts.
function _roSendScopeRows_() {
  var all = requestOrderState.data || [];
  // Site Confirm, when REQUIRED, is a business gate rather than a display filter, so it still applies.
  return _roSiteConfirmRequired() ? all.filter(_roIsRowConfirmed) : all;
}

// §C step 1 — FLUSH EVERY PENDING EDIT AND WAIT FOR IT. _roFlushPendingAutosaveOnUnmount_ is deliberately
// fire-and-forget (navigation must never block); a Send is the opposite case: it must not proceed over a write
// that is still in flight or that failed. Each pending callback goes through the SAME canonical locked writer
// and the SAME optimistic token, so this adds no second write path.
async function _roFlushDirtyEditsForSend_() {
  var out = { flushed: 0, failed: 0, errors: [] };
  var keys = Object.keys(_roAutosaveTimers_ || {});
  var pending = [];
  keys.forEach(function (k) {
    var t = _roAutosaveTimers_[k];
    if (t) { try { clearTimeout(t); } catch (e) {} }
    delete _roAutosaveTimers_[k];
    var fn = _roAutosavePending_[k];
    delete _roAutosavePending_[k];
    if (typeof fn !== 'function') return;
    try { pending.push(Promise.resolve(fn())); } catch (e2) { pending.push(Promise.reject(e2)); }
  });
  if (!pending.length) return out;
  out.flushed = pending.length;
  var settled = await Promise.all(pending.map(function (p) { return p.then(function () { return null; }, function (e) { return e; }); }));
  settled.forEach(function (e) { if (e) { out.failed++; out.errors.push(String((e && e.message) || e)); } });
  return out;
}

// §C — the ASSERTED quantities. One entry per SKU row identity carrying the quantities the USER believes are
// current, so the server can prove each one against the persisted draft. The quantity itself comes from the
// unchanged authority _roSendOrderQty_ (canonical persisted order_qty for a draft-backed SKU, else the manual
// effective value) — this is not a new quantity rule.
function _roBuildSendIntents_(rows, buckets) {
  var intents = [];
  (rows || []).forEach(function (entry) {
    var item = entry.item, lines = entry.lines;
    if (!lines.length) return;
    var tiers = {};
    lines.forEach(function (l) { tiers[l.bucket] = { order_qty: l.orderQty, month: l.month }; });
    intents.push({ company: item.company || '', country: item.country || '', marketplace: item.marketplace || '',
      sku: item.sku, series: item.series || '', tiers: tiers });
  });
  return intents;
}

// §D/§J — THE PROGRESS LINE. FB-3A's "allocation drafts 0/234" was a label defect (a SKU-row count printed as a
// draft count) and it must never come back, so this renderer names every unit explicitly and takes every number
// from the SERVER's frozen plan or its verified output — never from a page-side prediction.
//
// It also always answers the two questions a slow business write actually raises: WHERE IS IT (the journal
// phase), and MAY I WALK AWAY (safe-to-close / resumable). Both come from the server response.
var RO_SEND_PROGRESS_FIELDS_ = ['persisted_drafts', 'positive_tier_allocations', 'distinct_skus',
  'distinct_series', 'expected_headers', 'expected_lines', 'verified_headers', 'verified_lines',
  'journal_phase', 'safe_to_close'];
function _roSendProgressLine_(st) {
  st = st || {};
  var c = st.counts || {};
  return 'Send Request — ' + (st.journal_phase || 'working') +
    '  ·  persisted drafts ' + (c.active_persisted_drafts == null ? '?' : c.active_persisted_drafts) +
    '  ·  positive tier allocations ' + (c.positive_selected_tier_allocations == null ? '?' : c.positive_selected_tier_allocations) +
    '  ·  SKUs ' + (c.distinct_skus == null ? '?' : c.distinct_skus) +
    '  ·  Series ' + (c.distinct_series == null ? '?' : c.distinct_series) +
    '  ·  Request Orders verified ' + (st.verified_headers || 0) + '/' + (c.expected_request_order_headers == null ? '?' : c.expected_request_order_headers) + ' headers' +
    '  ·  lines verified ' + (st.verified_lines || 0) + '/' + (c.expected_request_order_lines == null ? '?' : c.expected_request_order_lines) +
    (st.continuation ? ('  ·  continuation ' + st.continuation) : '') +
    (st.safe_to_close ? '  ·  safe to close this page — the server owns the progress' : '  ·  do not close this page');
}
window._roSendProgressLine_ = _roSendProgressLine_;
window._roSendProgressFields_ = function () { return RO_SEND_PROGRESS_FIELDS_.slice(); };

// §D/§F — the confirmation summary. TWO clearly separated blocks, because conflating them is exactly the "234"
// defect: page rows are CANDIDATES, not persisted work units, and the dialog says so in those words.
//   ON THIS PAGE — 495 AI Plan rows / 234 SKU rows with a positive tier / 468 tier cells are CANDIDATE counts.
//   WILL BE SENT — the SERVER's counts over PERSISTED allocation drafts. This is the authority, and it is the
//                  FROZEN plan: the checksum shown here is the one the execute call must present back.
function _roSendConfirmSummary_(pageCounts, plan, typeLabel) {
  var c = (plan && plan.counts) || {};
  var x = (plan && plan.excluded) || {};
  var q = (plan && plan.quantity_verification) || {};
  var noDraft = Math.max(0, Number(pageCounts.sku_rows_with_positive_tier || 0) - Number(c.drafts_with_positive_selected_tier || 0));
  return 'Send Request — ' + typeLabel + '\n' +
    '\nSCOPE (user-frozen): tier scope ' + (plan && plan.tier_scope) + ' — the COMPLETE eligible population across' +
    '\nALL countries and marketplaces. Country, Marketplace, Category, Risk, Show mode, SKU search and' +
    '\npagination are DISPLAY ONLY and do NOT reduce this Send.' +
    '\n\nON THIS PAGE (candidate counts — NOT persisted allocation drafts)' +
    '\n  AI Plan rows loaded                 : ' + pageCounts.all_page_rows_loaded +
    '\n  SKU rows with a positive tier qty   : ' + pageCounts.sku_rows_with_positive_tier +
    '\n  Tier cells with a positive qty      : ' + pageCounts.tier_cells_with_positive_qty +
    '\n\nWILL BE SENT (server authority — PERSISTED allocation drafts, frozen)' +
    '\n  Active persisted drafts in the cycle: ' + c.active_persisted_drafts +
    '\n  Drafts with a positive tier in scope: ' + c.drafts_with_positive_selected_tier +
    '\n  Selected-tier allocations           : ' + c.selected_tier_allocations +
    '\n  POSITIVE selected-tier allocations  : ' + c.positive_selected_tier_allocations +
    '\n  Distinct SKUs                       : ' + c.distinct_skus +
    '\n  Distinct Series                     : ' + c.distinct_series +
    '\n  Request Orders to create (headers)  : ' + c.expected_request_order_headers +
    '\n  Request Order LINES to create       : ' + c.expected_request_order_lines +
    '\n  Total units                         : ' + c.total_units +
    '\n\nQUANTITY VERIFICATION' +
    '\n  Quantities asserted by this page    : ' + q.asserted +
    '\n  Verified against the database       : ' + q.verified +
    '\n  Saved zeros verified                : ' + (q.zero_verified || 0) +
    '\n  Persisted with no assertion         : ' + q.persisted_without_assertion +
    '\n\nEXCLUDED (server, typed)' +
    '\n  Page rows with NO persisted draft   : ' + noDraft + '  <- enter a quantity (which now saves a draft) first' +
    '\n  Already submitted (header terminal) : ' + (x.status_submitted || 0) +
    '\n  Cancelled                           : ' + (x.status_cancelled || 0) +
    '\n  Tier already sent (tier terminal)   : ' + (x.tier_terminal_already_sent || 0) +
    '\n  Tier saved as 0 (no line is created): ' + (x.tier_zero_or_blank_qty || 0) +
    '\n  Tier out of the selected scope      : ' + (x.tier_out_of_scope || 0) +
    '\n\nPlanning cycle: ' + (plan && plan.planning_cycle) +
    '\nFrozen source  : ' + (plan && plan.workset_checksum) +
    '\n\nEXACTLY this frozen set will be executed. If the persisted allocation changes before you confirm,' +
    '\nthe Send is refused (SEND_WORKSET_DRIFT) and you will be asked to preview again — it is never' +
    '\nsilently replaced by a different or larger Send.' +
    '\n\nProceed?';
}
window._roSendConfirmSummary_ = _roSendConfirmSummary_;
window._roSendTierScope_ = _roSendTierScope_;
window._roBuildSendIntents_ = _roBuildSendIntents_;

// ------------------------------------------------------------------------------------------------------------
// §D — THE AUTOMATIC CONTINUATION LOOP.
//
// A user click may cause several TECHNICAL calls, and that is not a return to the old per-SKU browser saga. The
// difference is total and it is worth stating precisely:
//   · every call carries the SAME immutable execution key and the SAME confirmed checksum;
//   · the browser sends no work list, no grouping, no ordering and no selection — it asks "continue";
//   · the SERVER reads its journal and decides the next work item;
//   · a reload can call requestOrder.send.status and continue from the same journal;
//   · the workset is NEVER rebuilt by the client, and a changed source is refused server-side as drift.
// The loop is bounded, reports each continuation, and stops on the first non-continuable answer.
// ------------------------------------------------------------------------------------------------------------
async function _roSendRunToCompletion_(basePayload, checksum, plan, sendMount) {
  var DB = window.KM.DB;
  var maxLoops = 40;                 // matches the server's ROS_MAX_CONTINUATIONS_; the server refuses beyond it
  var continuation = 0;
  var lastPartial = null;
  for (var i = 0; i < maxLoops; i++) {
    var payload = Object.assign({}, basePayload, { mode: 'execute', confirmed_checksum: checksum, continuation: continuation });
    var res = await DB.sendRequestOrderOrchestration(payload);
    if (!res || res.success !== true) return { done: false, res: res, continuation: continuation };
    var d = res.data || {};
    if (d.status !== 'PARTIAL_RESUMABLE') return { done: true, res: res, data: d, continuation: continuation };

    // A voluntary slice boundary. Report it, then continue automatically — the operator is not asked to press
    // anything, and the label says a continuation is running rather than pretending it is one long request.
    lastPartial = d;
    continuation = Number(d.continuation || continuation) + 1;
    _roSendTrace_({ phase: 'continuation', continuation: continuation, series_done: d.series_done,
      series_remaining: d.series_remaining, verified_headers: d.verified_headers, verified_lines: d.verified_lines,
      slice_budget_ms: d.slice_budget_ms, elapsed_ms: d.elapsed_ms });
    if (sendMount === _roSendState.mountSeq) {
      _roSetSendState_('LOADING', _roSendProgressLine_({ counts: d.counts, verified_headers: d.verified_headers,
        verified_lines: d.verified_lines, journal_phase: 'continuing (' + d.series_done + '/' + d.series_total + ' Series)',
        continuation: continuation, safe_to_close: d.safe_to_close === true }));
    }
  }
  return { done: false, exhausted: true, res: null, lastPartial: lastPartial, continuation: continuation };
}

async function handleSendRequest() {
  // SINGLE-FLIGHT. A second click while an orchestration is running is refused outright.
  if (_roSendState.busy) { _roSetSendState_('LOADING', 'A Send is already running — please wait for it to finish.'); return; }
  const _sendMount = _roSendState.mountSeq;   // page-transition guard: a late result must not repaint a newer page
  const requestType = document.getElementById('ro-request-type').value;
  const buckets = _roBucketsForType(requestType);
  const typeLabel = { all: 'All Request (T1+T2+T3)', t1: 'T1 Request', t2: 'T2 Request', t3: 'T3 Request' }[requestType];
  const tierScope = _roSendTierScope_(requestType);   // §B — the ONLY business scope control

  // Gate 1 (Site Confirm) — F1-7N-FA-3C-R6E-P0: enforced ONLY when Site Confirm is REQUIRED (backend-owned flag).
  if (_roSiteConfirmRequired()) {
    if (!(requestOrderState.confirmedSites || []).some(function(c) { return c.status === 'confirmed'; })) {
      alert('Please confirm all site scopes before sending this request.');
      return;
    }
    const pendingSites = _roUnconfirmedSites(buckets);
    if (pendingSites.length) {
      alert('Please confirm all site scopes before sending this request.\n\nPending (' + buckets.join('+') + '): ' + pendingSites.join(', '));
      return;
    }
  }

  // F1-7L: the per-line FC snapshot reads the broad-cache FC slice; ensure the bounded second-layer tables are
  // loaded before reading quantities (no whole Operation DB, no startup prime).
  try { await _roEnsureL2Tables(false); } catch (e) {}

  // §B — the UNFILTERED row universe. _applyRequestOrderFilters is NOT called: it is the DISPLAY authority.
  const rows = _roSendScopeRows_();
  const drafts = [];        // { item, lines:[...], isCanonical } — page-side CANDIDATES only, never written from here
  let partialCount = 0;
  const _roExcluded = {
    rows_in_scope: rows.length,
    all_page_rows: (requestOrderState.data || []).length,
    // §B — 0 BY CONSTRUCTION. The Send universe is the unfiltered page data, so no display control can remove a
    // row from it. The field is kept (and asserted) so the guarantee is visible in the dialog and in the trace.
    removed_by_display_filters: 0,
    already_submitted_sku: 0,
    no_positive_tier_qty: 0
  };
  rows.forEach(function(item) {
    // R4E5B §14/§18 — an already-executed (terminal submitted) SKU is never re-executed. The SERVER re-checks
    // this against the persisted status; this count exists so the dialog can explain the page-vs-server delta.
    if (typeof _roIsSubmittedSku_ === 'function' && _roIsSubmittedSku_(item.sku)) { _roExcluded.already_submitted_sku++; return; }
    const edits = requestOrderState.allocEdits[_roAllocKey(item)] || {};
    const upc = parseFloat(item.boxSize) || 0;
    const lines = [];
    buckets.forEach(function(b) {
      const idx = RO_TIER_LABELS.indexOf(b);
      const e = edits[b] || {};
      // R4E4 §10 — canonical persisted order_qty for a draft-backed SKU; else the manual effective value.
      // UNCHANGED authority: this is the number ASSERTED to the server, which then proves it against the DB.
      const eff = _roSendOrderQty_(item, idx, b, e);
      const q = (eff == null) ? 0 : Number(eff);
      if (isNaN(q) || q <= 0) return;
      const cb = _roCartonBreak(q, upc);
      if (cb.isValid && cb.isPartial) partialCount++;    // NON-blocking manual partial carton
      const mo = _roBucketMonthObj(b);
      const moYm = mo ? (mo.year + '-' + String(mo.idx + 1).padStart(2, '0')) : '';
      lines.push({ bucket: b, month: e.month || moYm, orderQty: q });
    });
    var isCanon = (typeof _roIsCanonicalDraftSku_ === 'function') && _roIsCanonicalDraftSku_(item.sku);
    if (lines.length) drafts.push({ item: item, lines: lines, isCanonical: isCanon });
    else _roExcluded.no_positive_tier_qty++;
  });

  // Page-side CANDIDATE counts, frozen and unit-labelled. NOT the send authority — the dialog labels them
  // "candidate counts — NOT persisted allocation drafts".
  const bySeries = {};
  drafts.forEach(function(d) { bySeries[d.item.series || '(no series)'] = 1; });
  const _roWorkset = _roBuildWorkset_(drafts, Object.keys(bySeries), _roExcluded, typeLabel);

  // §C step 1 — FLUSH pending edits and WAIT. A failed flush blocks the ENTIRE Send: a Send over an edit that
  // did not persist would silently use the older DB quantity, which is exactly what must not happen.
  _roSetSendState_('LOADING', 'Saving pending quantity edits…');
  const flush = await _roFlushDirtyEditsForSend_();
  if (flush.failed) {
    _roSetSendState_('ERROR', flush.failed + ' quantity edit(s) could not be saved. Nothing was sent.');
    alert('Send Request 已停止 — ' + flush.failed + ' 筆數量編輯未能寫入資料庫。\n\n' +
      'Nothing was sent and nothing was written. The unsaved value is still on screen: correct it, let it save, then Send again.\n\n' +
      '▸ ' + flush.errors.slice(0, 5).join('\n▸ '));
    return;
  }

  const DB = window.KM.DB;
  const planningCycle = _roSendPlanningCycle_();
  if (!planningCycle) {
    _roSetSendState_('ERROR', 'The current planning cycle could not be resolved.');
    alert('Send Request 已停止：無法判斷目前的 planning cycle（YYYY-MM）。\n\nNothing was sent. Run AI Plan / Search first so the current cycle is established.');
    return;
  }
  const intents = _roBuildSendIntents_(drafts, buckets);
  // R4E5B kept its execution planning-cycle input as the YEAR. It is passed through UNCHANGED so a Send that was
  // interrupted under the previous client converges on the SAME Request Order rather than creating a second one.
  const executionCycle = String(new Date().getFullYear());
  const basePayload = { tier_scope: tierScope, planning_cycle: planningCycle,
    execution_planning_cycle: executionCycle, intents: intents, actor: 'request-order' };

  // Demo mode: no DB — never reaches the orchestration.
  if (!_roUseDb()) {
    console.log('=== Send Request (DEMO, in-memory only) ===', { typeLabel: typeLabel, tierScope: tierScope, intents: intents.length });
    alert('DEMO (in-memory only, NOT written to DB)\n\n' + typeLabel +
      '\nSKU rows with a positive tier: ' + _roWorkset.sku_rows_with_positive_tier +
      '\nTier cells: ' + _roWorkset.tier_cells_with_positive_qty +
      '\n\nLive mode would run ONE server orchestration over the PERSISTED allocation drafts.');
    _roSetSendState_('IDLE', '');
    return;
  }
  if (typeof DB.sendRequestOrderOrchestration !== 'function') {
    _roSetSendState_('ERROR', 'This build cannot reach the Send orchestration.');
    alert('Send Request 無法執行：前端未載入 Send orchestration 傳輸層。\n\nNothing was sent. Reload the page; if it persists, the frontend deploy is incomplete.');
    return;
  }

  // ---- §F PREVIEW FIRST. Zero business writes; it FREEZES the plan in the server journal and returns the
  // checksum the execute call must present back. The counts the user approves are therefore the ones that will
  // execute, not a page-side prediction of them.
  _roSetSendState_('LOADING', 'Freezing the persisted allocation…');
  const pv = await DB.sendRequestOrderOrchestration(Object.assign({ mode: 'preview' }, basePayload));
  if (!pv || pv.success !== true) {
    _roSetSendState_('ERROR', 'Send could not be prepared. Nothing was written.');
    alert(_roSendOrchestrationErrorMessage_(pv, false));
    return;
  }
  const plan = pv.data || {};
  if (plan.status === 'NO_ELIGIBLE_PERSISTED_ALLOCATION' || !Number(((plan.counts) || {}).positive_selected_tier_allocations)) {
    _roSetSendState_('IDLE', '');
    alert('No eligible PERSISTED allocation to send (NO_ELIGIBLE_PERSISTED_ALLOCATION) — ' + typeLabel + '.\n\n' +
      'The page shows ' + _roWorkset.sku_rows_with_positive_tier + ' SKU row(s) with a positive tier quantity, but the database holds no ' +
      'active persisted allocation draft carrying one for this planning cycle and tier scope.\n\n' +
      'Enter or re-enter an Order Qty on a SKU — a deliberate quantity edit now SAVES a canonical allocation draft ' +
      'by itself — or run AI Plan, then Send again. Nothing was written.');
    return;
  }
  const frozenChecksum = String(plan.confirm_with_checksum || plan.workset_checksum || '');
  if (!frozenChecksum) {
    _roSetSendState_('ERROR', 'The server did not return a frozen source checksum. Nothing was written.');
    alert('Send Request 已停止：伺服器未回傳凍結後的來源檢查碼（workset checksum）。\n\nNothing was written. Reload and try again; if it persists, the Apps Script deploy is incomplete.');
    return;
  }
  if (!confirm(_roSendConfirmSummary_({ all_page_rows_loaded: _roExcluded.all_page_rows,
      sku_rows_with_positive_tier: _roWorkset.sku_rows_with_positive_tier,
      tier_cells_with_positive_qty: _roWorkset.tier_cells_with_positive_qty }, plan, typeLabel) +
      (partialCount ? ('\n\n(Partial-carton lines on this page: ' + partialCount + ' — allowed, recorded with loose units.)') : ''))) {
    _roSetSendState_('IDLE', '');
    return;
  }

  // ---- COMMIT. ONE user click; one immutable execution key; the server decides each next work item. ---------
  _roSendState.busy = true;
  _roSendState.requestId = _roSendRequestId_();
  _roSendState.startedAt = Date.now();
  _roSetSendState_('LOADING', _roSendProgressLine_({ counts: plan.counts, verified_headers: 0, verified_lines: 0,
    journal_phase: 'starting', safe_to_close: true }));
  _roSendTrace_({ phase: 'start', tier_scope: tierScope, planning_cycle: planningCycle,
    orchestration_key: plan.orchestration_key, workset_checksum: frozenChecksum,
    page_candidates: _roWorkset, server_plan: plan.counts });
  try {
    const run = await _roSendRunToCompletion_(basePayload, frozenChecksum, plan, _sendMount);
    if (run.exhausted) {
      _roSendTrace_({ phase: 'continuation_exhausted', continuation: run.continuation, verdict: 'PARTIAL' });
      if (_sendMount === _roSendState.mountSeq) {
        _roSetSendState_('ERROR', 'Send is still incomplete after ' + run.continuation + ' continuations. It remains resumable.');
        alert('Send Request 尚未完成（已達本頁的自動續行上限）\n\n' +
          'The Send is RESUMABLE and nothing is lost: the server journal owns the progress. Press Send again to ' +
          'continue the SAME execution — completed Series are skipped by execution key, so nothing is duplicated.\n\n' +
          'Execution key: ' + (plan.orchestration_key || '(unknown)'));
      }
      return;
    }
    if (!run.done) {
      const res = run.res, err = (res && res.error) || {};
      const indeterminate = /REQUEST_TIMEOUT/.test(String(err.code || ''));
      _roSendTrace_({ phase: 'error', code: String(err.code || ''), indeterminate: indeterminate,
        continuation: run.continuation, elapsed_ms: Date.now() - _roSendState.startedAt,
        verdict: indeterminate ? 'RESUMABLE' : 'FAILED' });
      if (_sendMount === _roSendState.mountSeq) {
        _roSetSendState_('ERROR', indeterminate
          ? 'No answer arrived in time. The Send is RESUMABLE by execution key — do not press Send again until you have reconciled.'
          : 'Send stopped. Nothing further was written; your inputs are kept.');
        alert(_roSendOrchestrationErrorMessage_(res, indeterminate));
      }
      return;
    }
    const d = run.data || {};
    if (_sendMount !== _roSendState.mountSeq) {
      // Navigation cannot own or cancel business progress: the orchestration already completed on the SERVER.
      // The result is traced and NOT discarded as "nothing happened" — only the repaint is skipped.
      _roSendTrace_({ phase: 'success_discarded_stale_mount', request_orders: d.request_order_count,
        elapsed_ms: Date.now() - _roSendState.startedAt, verdict: 'SUCCESS' });
      return;
    }
    if (typeof _roLoadCanonicalDraftsForScope_ === 'function') { _roLoadCanonicalDraftsForScope_(_roCanonicalScope_()); }
    _roSendTrace_({ phase: 'success', status: d.status, request_orders: d.request_order_count,
      verified_headers: d.verified_headers, verified_lines: d.verified_lines,
      drafts_advanced: d.allocation_drafts_advanced, continuations: run.continuation,
      elapsed_ms: Date.now() - _roSendState.startedAt, verdict: 'SUCCESS' });
    const reusedCount = (d.request_orders_reused || []).length;
    _roSetSendState_('SUCCESS', 'Sent — ' + (d.verified_headers || 0) + ' verified Request Order(s), ' +
      (d.verified_lines || 0) + ' verified line(s).');
    alert('✅ Send Request 完成\n\n' + typeLabel +
      '\nRequest Order headers  : ' + d.request_order_count + (reusedCount ? ('（其中 ' + reusedCount + ' 筆為既有訂單，未重複建立）') : '') +
      '\nVERIFIED headers       : ' + (d.verified_headers || 0) +
      '\nVERIFIED lines         : ' + (d.verified_lines || 0) +
      '\nVERIFIED units         : ' + (d.verified_units || 0) +
      '\nAllocation drafts advanced : ' + d.allocation_drafts_advanced +
      (run.continuation ? ('\nServer continuations   : ' + run.continuation) : '') +
      ((d.request_orders_created || []).length ? ('\n\n' + (d.request_orders_created || []).map(function (x) { return x.request_order_no; }).join(', ')) : '') +
      ((d.unverified_transitions || []).length ? ('\n\n⚠ ' + d.unverified_transitions.length + ' lifecycle row(s) could not be re-read — run the interrupted-Send reconciliation.') : '') +
      '\n\nEvery line above was read back and matched field by field (quantity, tier, month, SKU, Series and source draft) before any allocation was marked sent.' +
      '\n\n' + d.next_action);
    renderRequestOrderTable();
  } catch (err) {
    // The transport runner does not throw, so reaching here is an unexpected client fault. It is NEVER reported
    // as a zero-write: the orchestration may have committed.
    var _msg = String((err && err.message) || err || '');
    _roSendTrace_({ phase: 'error', unexpected: true, elapsed_ms: Date.now() - _roSendState.startedAt, verdict: 'INDETERMINATE' });
    if (_sendMount === _roSendState.mountSeq) {
      _roSetSendState_('ERROR', 'Send ended unexpectedly. Verify before retrying.');
      alert('Send Request 發生非預期錯誤，且無法確認伺服器是否已寫入。\n\n' +
        '請勿直接重試：先執行 interrupted-Send reconciliation（system.requestOrderSendReconcile）確認狀態。\n\n▸ Technical: ' + _msg);
    }
  } finally {
    // ALWAYS terminal: the latch is released whatever happened. There is no write batch to close — the whole
    // Send is one server-owned execution, so the single post-write reconcile is the transport runner's own.
    _roSendState.busy = false;
    var _btn = _roSendBtn_();
    if (_btn) { _btn.disabled = false; _btn.setAttribute('aria-busy', 'false'); }
    _roSendTrace_({ phase: 'released', elapsed_ms: Date.now() - _roSendState.startedAt });
  }
}

// The current-run authority, as a value: the planning cycle the persisted drafts are keyed by (YYYY-MM). It is
// resolved from the SAME authority the rest of the page uses (the canonical draft cycle when one is hydrated,
// else the Asia/Taipei current cycle the AI-Plan read already resolves) — never from the server's clock and
// never invented here. A blank result BLOCKS the Send rather than guessing a cycle.
function _roSendPlanningCycle_() {
  // 1. Prefer the cycle the PERSISTED drafts are actually keyed by (from the hydrated flat read-back), so the
  //    Send targets the same run the page is displaying rather than a computed guess.
  try {
    var keys = Object.keys(_roCanonicalDraftBySku || {});
    for (var i = 0; i < keys.length; i++) {
      var pc = String((_roCanonicalDraftBySku[keys[i]] || {}).planningCycle || '').trim().replace(/^RECO-/, '');
      if (/^\d{4}-\d{2}$/.test(pc)) return pc;
    }
  } catch (e) {}
  // 2. Else the SAME Asia/Taipei cycle authority the AI-Plan first-layer read already uses (_opFirstLayerCycle
  //    -> 'RECO-YYYY-MM'). No second clock, no server clock, no invented cycle.
  try {
    if (typeof _opFirstLayerCycle === 'function') {
      var c = String(_opFirstLayerCycle() || '').replace(/^RECO-/, '');
      if (/^\d{4}-\d{2}$/.test(c)) return c;
    }
  } catch (e2) {}
  return '';   // blank BLOCKS the Send — a guessed cycle would send the wrong run
}
window._roSendPlanningCycle_ = _roSendPlanningCycle_;

// The orchestration's error surface. Every branch names the stage, states the write posture truthfully, and
// gives the ONE correct next action. A timeout is never presented as a zero-write and never invites a retry.
function _roSendOrchestrationErrorMessage_(res, indeterminate) {
  var e = (res && res.error) || {};
  var det = e.details || {};
  var code = String(e.code || 'SEND_ORCHESTRATION_FAILED');
  if (indeterminate) {
    return 'Send Request 未取得伺服器回應（逾時）。\n\n' +
      'The orchestration may still be running or may already have committed. It is RESUMABLE BY EXECUTION KEY, ' +
      'so do NOT press Send again — a blind retry is what creates duplicates.\n\n' +
      '1. Run the interrupted-Send reconciliation (system.requestOrderSendReconcile) for this planning cycle.\n' +
      '2. If it reports retry_safe, re-run the SAME Send: completed Series are skipped by execution key.\n\n' +
      '▸ Technical: ' + code;
  }
  if (code === 'QUANTITY_VERIFICATION_FAILED') {
    var f = (det.failures || []).slice(0, 8).map(function (x) {
      return '  · ' + x.sku + ' ' + x.request_bucket + ' — ' + x.code +
        ' (on screen ' + x.intended_qty + ', in database ' + (x.persisted_qty == null ? 'NOT PERSISTED' : x.persisted_qty) + ')';
    }).join('\n');
    return 'Send Request 已停止 — 數量驗證失敗（未寫入任何資料）。\n\n' +
      det.failure_count + ' asserted quantity/quantities do not match the persisted allocation. The ENTIRE Send was ' +
      'blocked on purpose: sending the rest would commit the OLD database quantity for these rows.\n\n' + f +
      '\n\nRe-enter the value so it saves (or run AI Plan to materialize the draft), then Send again.\n' +
      'Nothing was written and no lifecycle status changed.';
  }
  if (code === 'SEND_IN_PROGRESS_SAME_KEY') {
    return 'Send Request 已在執行中（同一個 execution key）。\n\nDo not retry — read back by execution key, or wait for it to finish.\n\n▸ ' + String(e.message || '');
  }
  if (code === 'SOURCE_CHANGED_SINCE_INTERRUPTION') {
    return 'Send Request 無法續行：自上次中斷後，已保存的配額內容已變更。\n\nRun the interrupted-Send reconciliation first, then start a fresh Send. Nothing was written.\n\n▸ ' + String(e.message || '');
  }
  if (code === 'REQUEST_ORDER_OUTPUT_UNPROVEN' || code === 'ALLOCATION_TRANSITION_FAILED') {
    return 'Send Request 未完成 — ' + code + '\n\n' + String(e.message || '') +
      '\n\nRun the interrupted-Send reconciliation before any retry.\n\n▸ Technical: ' + code;
  }
  if (code === 'DEPLOYMENT_CONTRACT_MISMATCH') {
    return String(e.message || 'The deployed Apps Script is out of date.') +
      '\n\nNothing was read and nothing was written. Retrying cannot help — a new deployment version must be published.';
  }
  return 'Send Request 失敗（未寫入任何 Request Order）。\n\n' + String(e.message || code) + '\n\n▸ Technical: ' + code;
}
window._roSendOrchestrationErrorMessage_ = _roSendOrchestrationErrorMessage_;

// AI Plan (Order System) — refreshes order suggestions using the EXISTING Suggest Order / order-calculation
// path (renderRequestOrderTable recomputes suggestions from the current filter + request scope; the same
// entry used on initial load and filter refresh). It NEVER confirms a site and NEVER sends a request — it is
// a suggestion-refresh only. No new AI model / API / recommendation schema is introduced. Loading state
// guards against double-click and exposes success/error styling.
// F1-4B-FM6 — AI Plan is DETERMINISTIC Phase-1 recommendation generation (NOT an LLM): it reads the latest
// MATERIALIZED order_planning_gap rows already loaded for the scope (_opMatCache.bySku) and runs the canonical
// KMREC generator. It recalculates NO gap, runs NO allocation, writes NOTHING, and NEVER touches the manual
// Order Qty inputs. The stored T1–T4 suggested quantities are surfaced per tier; a single TOTAL is intentionally
// NOT auto-summed (ORDER_RECOMMENDATION_TOTAL_AUTHORITY_NOT_FROZEN — independent per-tier carton rounding).
var _roRecoByKey = {};   // sku → KMREC order-planning recommendation DTO (Phase-1 page state; regenerated by AI Plan)
function _roRecoFmtQty(n) { try { return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString() : '—'; } catch (e) { return String(n); } }
function _roRecoActionHtml(item) {
  if (!item || typeof window === 'undefined' || !window.KMREC) return '';
  var dto = _roRecoByKey[String(item.sku)];
  if (!dto) return '';
  var row = (typeof _opMatCache !== 'undefined' && _opMatCache && _opMatCache.bySku) ? _opMatCache.bySku[String(item.sku)] : null;
  if (row && window.KMREC.isStale(dto, row)) return '<div class="ro-reco-action ro-reco-action--stale">⚠ Recommendation outdated — run AI Plan to refresh.</div>';
  if (dto.status === 'BLOCKED') return '<div class="ro-reco-action ro-reco-action--blocked"><div class="ro-reco-action__title">Recommended Action</div><div class="ro-reco-action__note">Recommendation unavailable.</div></div>';
  if (dto.status === 'NO_ACTION') return '<div class="ro-reco-action ro-reco-action--none"><div class="ro-reco-action__title">Recommended Action</div><div class="ro-reco-action__note">No order action required across T1–T4.</div></div>';
  var tiers = (dto.tiers || []).map(function (t) {
    var vis = (t.tier === 'T4') ? ' ro-reco-tier--visibility' : '';
    var suffix = (t.tier === 'T4') ? ' <em>(visibility)</em>' : '';
    return '<span class="ro-reco-tier' + vis + '">' + _roEsc(t.tier) + ': <strong>' + _roRecoFmtQty(t.suggestedQty) + '</strong>' + suffix + '</span>';
  }).join('');
  // Actionable Total (§1/§7, FROZEN): raw T1–T3 gaps cartonized ONCE. null → units-per-carton not yet available.
  var totalHtml = (typeof dto.totalRecommendedQty === 'number' && isFinite(dto.totalRecommendedQty))
    ? '<span class="ro-reco-action__total-qty">' + _roRecoFmtQty(dto.totalRecommendedQty) + '</span>'
    : '<span class="ro-reco-action__total-qty ro-reco-action__total-qty--na">—</span>';
  var totalNote = (typeof dto.totalRecommendedQty === 'number' && isFinite(dto.totalRecommendedQty))
    ? 'Based on T1–T3 raw gaps, cartonized once. T4 is forward visibility only. Manual Order Qty is unchanged.'
    : 'Actionable total pending — units-per-carton unavailable for this SKU. Per-tier values above are display only; Manual Order Qty is unchanged.';
  return '<div class="ro-reco-action ro-reco-action--ready"><div class="ro-reco-action__title">Recommended Order (per tier)</div>'
    + '<div class="ro-reco-action__tiers">' + tiers + '</div>'
    + '<div class="ro-reco-action__total"><span class="ro-reco-action__total-label">Actionable Total (T1–T3)</span>' + totalHtml + '</div>'
    + '<div class="ro-reco-action__note">' + totalNote + '</div></div>';
}
function handleRequestOrderAiPlan(scope) {
  var btn = document.getElementById('ro-ai-plan-btn');
  if (btn && btn.disabled) return;
  // F1-AI-SUPPORT-SCOPE-R1: capture the user-chosen { company, country, marketplace, marketplaceId } DTO when the
  // scope modal supplied one. HONEST BOUNDARY: the canonical page-level AI Plan generator (window.KMREC) is not yet
  // FM6-R4 scope-parameterized — it deterministically derives from the MATERIALIZED gap rows already loaded for the
  // on-screen scope. The DTO is threaded + retained (window._roAiPlanScope) for the future FM6-R4 canonical persister
  // path; this round does NOT invent a scope-filtered engine.
  if (scope && typeof scope === 'object') { window._roAiPlanScope = scope; }
  if (btn) { btn.disabled = true; btn.classList.remove('is-success', 'is-error'); btn.classList.add('is-loading'); }
  try {
    // Deterministic generation from the MATERIALIZED gap rows already loaded for the scope (no gap recalc, no API,
    // no allocation, no Order Qty write).
    if (window.KMREC && typeof _opMatCache !== 'undefined' && _opMatCache && _opMatCache.bySku) {
      var now = (function () { try { return (new Date()).toISOString(); } catch (e) { return null; } })();
      // sku → units-per-carton from the loaded rows (sku_details.unitsPerCarton = item.boxSize) — the SAME UPC
      // authority the automatic backend generator uses (F1-4B-FM5-R1), so the actionable total cartonizes ONCE.
      var upcBySku = {};
      try { (requestOrderState.data || []).forEach(function (it) { var u = parseFloat(it && it.boxSize); if (it && it.sku != null && isFinite(u) && u > 0) upcBySku[String(it.sku)] = u; }); } catch (e) {}
      _roRecoByKey = {};
      Object.keys(_opMatCache.bySku).forEach(function (sku) { var dto = window.KMREC.generateOrderPlanningRecommendation(_opMatCache.bySku[sku], { now: now, unitsPerCarton: upcBySku[String(sku)] }); if (dto) _roRecoByKey[String(sku)] = dto; });
    }
    renderRequestOrderTable();   // re-render surfaces the Recommended Action note — NOT Send Request / Confirm Site
    if (btn) { btn.classList.remove('is-loading'); btn.classList.add('is-success'); setTimeout(function () { if (btn) btn.classList.remove('is-success'); }, 1200); }
    // F1-4B-FM6-R4E3 §2/§6/§7/§14 — for a CONCRETE scope, AI Plan now ALSO executes the canonical production path:
    // requestOrderDraft.job.start → poll job.continue to terminal → ONE getActive → render Order Allocation from the
    // PERSISTED DB drafts (the execution authority). The KMREC render above is DISPLAY-ONLY (informational summary),
    // NOT the execution source. No browser per-SKU fan-out; one logical scope job. When no concrete scope is available
    // (scope modal unavailable / demo), the KMREC summary refresh is the only effect (honest boundary — the backend
    // job requires company+country+marketplace and never starts scopeless).
    try {
      var _cs = (scope && scope.company && scope.country && scope.marketplace)
        ? { company: scope.company, country: scope.country, marketplace: scope.marketplace }
        : (typeof _roCanonicalScope_ === 'function' ? _roCanonicalScope_() : null);
      if (_cs && typeof _roRunAiPlanJob_ === 'function') { _roRunAiPlanJob_(_cs); }
    } catch (e2) { /* job kickoff failure never breaks the local KMREC render */ }
  } catch (err) {
    if (btn) { btn.classList.remove('is-loading'); btn.classList.add('is-error'); setTimeout(function () { if (btn) btn.classList.remove('is-error'); }, 1600); }
    console.error('[AI Plan] recommendation generation failed:', err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.setRequestOrderSeries = setRequestOrderSeries;
window.setRequestOrderCategory = setRequestOrderCategory;
window.handleRequestOrderSearch = handleRequestOrderSearch;
window.setRequestOrderShowMode = setRequestOrderShowMode;
window.handleSendRequest = handleSendRequest;
window.handleRequestOrderAiPlan = handleRequestOrderAiPlan;
window.roPrevPage = roPrevPage;
window.roNextPage = roNextPage;
window.openConfirmSiteModal = openConfirmSiteModal;
window.saveConfirmSite = saveConfirmSite;
window.initRequestOrderSection = initRequestOrderSection;
window.toggleRequestOrderSkuExpand = toggleRequestOrderSkuExpand;
window._roAllocEdit = _roAllocEdit;
window._roAllocEditNote = _roAllocEditNote;
window._roAllocNoteFlush = _roAllocNoteFlush;   // F1-7N-FA-3C-R6B — inline note blur/Enter flush
window.handleEditTargetPct = handleEditTargetPct;
window.handleFcUpdate = handleFcUpdate;
window._roCloseModal = _roCloseModal;



// ========================================
// Demo Data Layer: Phase 3B - Request Order Mapping
// ========================================
function _getDemoRequestOrderData() {
    var rows = window.KM.DemoData.getRequestOrderRows({});
    return rows.map(function(r) {
        var shortageQty = r.shortage_qty || 0;
        var suggestOrder = r.suggest_order_qty || 0;
        return {
            sku: r.sku,
            series: r.series || '',
            country: r.country || 'US',
            marketplace: r.marketplace || 'Amazon',
            category: r.category || '',
            company: 'Kitchen Mama',
            risk: r.decision_status === 'order_needed' ? 'High' : 'Low',
            basicFcT3: r.forecast_qty || 0,
            specialEventsFc: 0,
            siteStock: r.current_stock || 0,
            thirdPartyStock: 0,
            factoryStock: 0,
            totalOngoingOrders: r.incoming_qty || 0,
            shortageM1: shortageQty > 0 ? -shortageQty : 0,
            shortageM2: 0,
            shortageM3: 0,
            achievementRate: 90,
            boxSize: 40,
            year: 2026,
            months: [r.forecast_qty || 0, r.forecast_qty || 0, r.forecast_qty || 0,
                     r.forecast_qty || 0, r.forecast_qty || 0, r.forecast_qty || 0,
                     r.forecast_qty || 0, r.forecast_qty || 0, r.forecast_qty || 0,
                     r.forecast_qty || 0, r.forecast_qty || 0, r.forecast_qty || 0],
            totalSuggestOrder: suggestOrder,
            decisionStatus: r.decision_status || 'sufficient',
            reason: r.reason || ''
        };
    });
}

function _showRequestOrderDemoBadge() {
    var header = document.querySelector('#request-order-section .page-header');
    if (!header) return;
    if (header.querySelector('.demo-badge')) return;
    var badge = document.createElement('span');
    badge.className = 'demo-badge';
    badge.style.cssText = 'background:#8b5cf6;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:12px;vertical-align:middle;';
    badge.textContent = 'Demo Data Mode';
    var title = header.querySelector('.page-title');
    if (title) title.appendChild(badge);
}

function _removeRequestOrderDemoBadge() {
    var badge = document.querySelector('#request-order-section .demo-badge');
    if (badge) badge.remove();
}

// Patch initRequestOrderSection to show/hide badge
var _origInitRequestOrderSection = initRequestOrderSection;
initRequestOrderSection = function() {
    _origInitRequestOrderSection();
    if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
        _showRequestOrderDemoBadge();
    } else {
        _removeRequestOrderDemoBadge();
    }
};
window.initRequestOrderSection = initRequestOrderSection;

// Debug helper
window.debugRequestOrderDemoData = function() {
    var enabled = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
    console.log('=== Request Order Demo Data Debug ===');
    console.log('Demo enabled:', enabled);
    if (!enabled) { console.log('Demo mode is OFF. Use setDemoDataMode(true) to enable.'); return; }
    var rows = window.KM.DemoData.getRequestOrderRows({});
    console.log('DemoData requestOrders rows:', rows.length);
    var mapped = _getDemoRequestOrderData();
    console.log('Mapped Request Order rows:', mapped.length);
    console.log('--- First 5 raw rows ---');
    console.table(rows.slice(0, 5));
    console.log('--- First 10 mapped rows ---');
    console.table(mapped.slice(0, 10));
};

// ========================================
// Lifecycle 註冊
// ========================================
// Ensure the Request Order markup is present before initRequestOrderSection runs.
// Idempotent: if #request-order-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureRequestOrderMarkup() {
    if (document.getElementById('request-order-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('request-order', 'assets/html/pages/request-order.html', '#request-order-mount')
            .then(function() {
                if (!document.getElementById('request-order-section')) {
                    console.warn('[RequestOrder] partial loaded but #request-order-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[RequestOrder] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[RequestOrder] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}

if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('request-order-section', {
        mount(navEpoch) {
            console.log('[RequestOrder] mount');
            // Markup is partial-loaded (Phase 3-5). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open) and init.
            _ensureRequestOrderMarkup().then(function() {
                // F1-7N-FA-3C-R6C — LATEST-NAVIGATION-WINS: if a newer navigation superseded this one while the markup
                // was loading, DISCARD this stale mount — do NOT re-activate the (now background) section and do NOT
                // re-run init/hydration. This closes both the two-visible-pages race AND the wasteful re-hydration that
                // repeatedly hit the DB (the R6C incident: hydrationRequestCount climbing across superseded remounts).
                if (navEpoch != null && window.KM && window.KM.lifecycle && typeof window.KM.lifecycle.commitGuard === 'function'
                    && !window.KM.lifecycle.commitGuard(navEpoch, 'request-order-section')) return;
                var sec = document.getElementById('request-order-section');
                if (sec) sec.classList.add('active');
                if (window.initRequestOrderSection) {
                    window.initRequestOrderSection();
                }
                // F1-4B-FM5-R4J §13 — resume a still-running backend Order Planning gap job on mount/reload.
                if (typeof _roResumeGapJobOnMount_ === 'function') { try { _roResumeGapJobOnMount_(); } catch (e) {} }
                // F1-4B-FM6-R4E3-PRE §18/§21 — restore persisted canonical Request Order drafts for the current
                // concrete scope (one getActive read) so a reload shows saved order_qty as execution authority.
                if (typeof _roLoadCanonicalDraftsOnMount_ === 'function') { try { _roLoadCanonicalDraftsOnMount_(); } catch (e) {} }
                // F1-4B-FM6-R4E3 §16 — if a scope AI Plan draft job is still RUNNING for the current scope, resume
                // driving it (progress + contextual cancel) instead of starting a duplicate.
                if (typeof _roResumeAiPlanJobOnMount_ === 'function') { try { _roResumeAiPlanJobOnMount_(); } catch (e) {} }
            });
        },
        unmount() {
            console.log('[RequestOrder] unmount');
            // F1-7N-FA-3C-R6C (Objective E) — a route change must NOT silently drop a pending autosave. Flush any pending
            // debounced Note write immediately (fire-and-forget through the SAME serialized writer + optimistic token, so
            // a failed edit is never shown as Saved and a stale page response cannot overwrite the next page — the write
            // targets the Draft by id, not the DOM). Navigation is never frozen. Blur/Enter already flush on a real click;
            // this covers a programmatic nav with no blur.
            if (typeof _roFlushPendingAutosaveOnUnmount_ === 'function') { try { _roFlushPendingAutosaveOnUnmount_(); } catch (e) {} }
        }
    });
}

// ============================================================
// F1-4B-FM6-R4E3-PRE — Canonical incremental order_qty edit persistence.
// A Request Order row backed by a PERSISTED canonical draft (created by the R4E2-B2 job, discovered via
// requestOrderDraft.getActive) persists Order Qty edits incrementally to request_order_allocation_draft_lines
// through the EXISTING locked decision writer (updateRecommendationDecisionLocked) under the optimistic-lock token.
// recommended_qty / gap snapshot / UPC stay system-owned (never in the edit). NO second writer, NO Send Request
// change, NO PO/shipment/stock write, NO formula. NO_DRAFT / conflict / foreign rows keep the existing in-memory
// planning behavior and NEVER auto-create a draft (AI Plan remains the draft-creation boundary).
// ============================================================
var _roCanonicalDraftBySku = {};   // sku(UPPER) → { draftId, draftVersion, expectedToken, status, conflict, lines:{ 'T1':{request_month, order_qty, recommended_qty, ...} } }
var _roNoDraftSkus = {};           // §12 — sku(UPPER) → true for SKUs the last scope read-back reported as NO_DRAFT
// F1-7N-FA-3C-R6B1 — Order Allocation hydration state (fixes the misleading async gap: Suggested rendered while the
// editable allocation was blank). IDLE (nothing to hydrate) | LOADING (a scope read-back is in flight) | LOADED |
// ERROR. Per-scope confirmed-DTO cache (session) dedupes identical scopes and lets Search/expand render immediately.
var _roHydrationStatus = 'IDLE';
var _roDraftDtoCache = {};         // scopeKey → { drafts:{sku→dto}, noDraft:{sku→true}, submitted:{sku→true} } (confirmed, session)
function _roScopeKey3_(s) { return [String((s && s.company) || '').trim().toUpperCase(), String((s && s.country) || '').trim().toUpperCase(), String((s && s.marketplace) || '').trim().toUpperCase()].join('|'); }
// Per-SKU Order Allocation UI state. LOADED shows DB order_qty/carton/note (enabled); NO_SAVED_DRAFT / DRAFT_CONFLICT /
// DRAFT_LOAD_ERROR disable the inputs (never a blank editable field, never a Suggested→Order Qty fallback); DRAFT_LOADING
// is the in-flight skeleton. A SKU outside any AI read-back (not a draft, not NO_DRAFT) keeps the ordinary MANUAL flow.
function _roDraftUiState_(sku) {
  var k = _roCanonKey_(sku), d = _roCanonicalDraftBySku[k];
  if (d && d.conflict) return 'DRAFT_CONFLICT';
  if (d && d.draftId) return 'DRAFT_LOADED';
  if (_roNoDraftSkus[k]) return 'NO_SAVED_DRAFT';
  if (_roHydrationStatus === 'LOADING') return 'DRAFT_LOADING';
  if (_roHydrationStatus === 'ERROR') return 'DRAFT_LOAD_ERROR';
  return 'MANUAL';   // no AI read-back touched this SKU → the ordinary in-memory planning flow (unchanged)
}
function _roCanonKey_(sku) { return String(sku == null ? '' : sku).trim().toUpperCase(); }
// §12 — this SKU was explicitly reported NO_DRAFT by the scope read-back (execution row unavailable; NEVER a silent
// frontend recompute fallback). Only true AFTER a getActive read-back — a SKU with no canonical draft and no read-back
// keeps the ordinary planning view (the whole page is not "no draft" before AI Plan is ever run).
function _roIsNoDraftSku_(sku) { return !!_roNoDraftSkus[_roCanonKey_(sku)]; }
// F1-7N-FA-3C-R6B — a concrete scope for the scope-level getActive read. The prior version returned a scope ONLY from
// window._roAiPlanScope (set only when AI Plan runs THIS session) → after a browser refresh it was null → the persisted
// Draft was never read back → Order Allocation blanked (root cause). Now it ALSO derives the concrete scope from the
// currently-loaded/searched rows, so a persisted flat Draft hydrates on refresh WITHOUT running AI Plan.
function _roScopeStr_(v) { return String(v == null ? '' : v).trim(); }
function _roScopesFromLoadedData_() {
  var seen = {}, out = [];
  (requestOrderState.data || []).forEach(function (r) {
    var c = _roScopeStr_(r && r.company), co = _roScopeStr_(r && r.country), m = _roScopeStr_(r && r.marketplace);
    if (!c || !co || !m || c === 'All' || co === 'All' || m === 'All') return;   // only fully-concrete scopes
    var k = c + '|' + co + '|' + m; if (seen[k]) return; seen[k] = 1; out.push({ company: c, country: co, marketplace: m });
  });
  return out;
}
function _roCanonicalScope_() {
  var s = window._roAiPlanScope;
  if (s && s.company && s.country && s.marketplace) return { company: s.company, country: s.country, marketplace: s.marketplace };
  var d = _roScopesFromLoadedData_();
  return d.length === 1 ? d[0] : null;   // exactly one concrete scope on screen → hydrate it (ambiguous → the multi-scope hydrator)
}
// Is this SKU an ACTIVE persisted-draft execution authority (edits go to the canonical writer, not in-memory only)?
function _roIsCanonicalDraftSku_(sku) {
  var d = _roCanonicalDraftBySku[_roCanonKey_(sku)];
  return !!(d && d.draftId && !d.conflict);
}
function _roCanonicalRowFor_(sku, bucket) {
  var d = _roCanonicalDraftBySku[_roCanonKey_(sku)];
  if (!d || d.conflict || !d.lines) return null;
  var l = d.lines[String(bucket)];
  return l ? { draft: d, line: l } : null;
}
// DISPLAY Order Qty for the grid (NOT the Send Request payload): an in-flight local edit wins; else a persisted
// canonical-draft row shows its DB order_qty; else the frozen effective value. _roEffectiveOrderQty is untouched.
function _roRowOrderQtyDisplay_(item, idx, bucket, edit) {
  if (edit && edit.orderQty != null && edit.orderQty !== '') return Number(edit.orderQty);
  var ref = _roCanonicalRowFor_(item && item.sku, bucket);
  if (ref && ref.line.order_qty != null && ref.line.order_qty !== '') return Number(ref.line.order_qty);
  return _roEffectiveOrderQty(item, idx, edit);
}
// F1-4B-FM6-R4E4 §10 — Send Request execution quantity authority. For a SKU backed by a PERSISTED canonical draft
// the confirmed quantity is the canonical persisted order_qty (NOT a live gap/KMREC/FC/suggested/display recompute);
// only the manual / no-canonical-draft path falls back to the in-memory effective value (the ordinary manual flow).
function _roSendOrderQty_(item, idx, bucket, edit) {
  var ref = _roCanonicalRowFor_(item && item.sku, bucket);
  if (ref && ref.line.order_qty != null && ref.line.order_qty !== '') return Number(ref.line.order_qty);
  return _roEffectiveOrderQty(item, idx, edit);
}
// F1-4B-FM6-R4E5B — DETERMINISTIC manual allocation-draft id (grain + planning cycle). A manual (no-AI) Send must
// be idempotent across retries: reusing this stable id makes upsertRequestOrderAllocationDraft find-or-update the
// SAME row (never a new one), so the backend execution key stays stable → exactly one Request Order. Byte-stable.
//
// F1-7N-FB-3B §C — RETIRED FROM THE SEND TRANSITION, DELIBERATELY NOT DELETED.
// handleSendRequest no longer calls this. §C forbids creating a draft from a raw AI Plan row and sending it in
// the same transition, and under the live flat-V2 cutover a 'RAD-M-…' id is not the canonical identity for its
// scope at all (that is 'RD::MONTHLY_ORDER::<YYYY-MM>::company=…|country=…|draft_purpose=…|marketplace=…|sku=…'),
// so rows written under this id were invisible to the very read-back the page uses to prove a draft exists.
// The function is KEPT because the decision to retire the path is a BUSINESS decision that must stay reversible,
// and because it documents the exact identity of the retired path for the canonical-conflict report. It is
// referenced by the R4E5B determinism test and by nothing in the Send path — a regression test asserts both.
function _roManualDraftId_(company, country, marketplace, sku, cycle) {
  function s(v) { return String(v == null ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'); }
  return 'RAD-M-' + [s(company), s(country), s(marketplace), s(sku), s(cycle)].join('-');
}
// §14/§18/§20 — SKUs already executed (terminal submitted allocation) per the last scope read-back. Excluded from a
// new Send so a re-send never creates a second Request Order.
var _roSubmittedSkus = {};
function _roIsSubmittedSku_(sku) { return !!_roSubmittedSkus[_roCanonKey_(sku)]; }
// __RO_EDIT_PURE_START__
// PURE — the locked decision-edit command for ONE order_qty change. order_qty ONLY (recommended_qty / gap snapshot /
// UPC are system-owned and never included). naturalKey = the canonical MONTHLY line grain {request_month, request_bucket}.
function _roBuildOrderQtyEditCommand_(draftId, requestMonth, requestBucket, orderQty, expectedToken) {
  return {
    recommendationType: 'MONTHLY_ORDER', draftId: String(draftId),
    edits: [{ naturalKey: { request_month: String(requestMonth), request_bucket: String(requestBucket) }, fields: { order_qty: Number(orderQty) } }],
    expectedToken: expectedToken, actor: 'request-order'
  };
}
// F1-7N-FA-3C-R6B — general per-tier edit command carrying order_qty and/or note. `note` is included ONLY when the
// patch provides the key (a BLANK note is a deliberate empty-string overwrite, NEVER "field omitted"). carton_qty is
// NEVER authored by the frontend — the backend (KMRDV2.applyTierEdit) recomputes it from units_per_carton.
function _roBuildTierEditCommand_(draftId, requestMonth, requestBucket, patch, expectedToken) {
  var fields = {};
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'order_qty') && patch.order_qty != null && patch.order_qty !== '') fields.order_qty = Number(patch.order_qty);
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'note')) fields.note = String(patch.note == null ? '' : patch.note);   // blank → '' (deliberate replace)
  return {
    recommendationType: 'MONTHLY_ORDER', draftId: String(draftId),
    edits: [{ naturalKey: { request_month: String(requestMonth), request_bucket: String(requestBucket) }, fields: fields }],
    expectedToken: expectedToken, actor: 'request-order'
  };
}
// F1-7N-FA-3C-R2b-3 — the ONE MONTHLY flat-V2 DTO normalization seam. getActive returns EITHER the legacy
// {header, lines[]} shape (cutover OFF, live) OR the flat readback DTO with a `tiers` array (cutover ON). The
// frontend adapts to whatever shape the backend actually sent, so there is never a destructive read-model/
// write-model mismatch. A flat DTO is PROJECTED into the exact same {draftId, draftVersion, status, lines:{T1..}}
// UI model the legacy path produces — so ALL downstream render/edit/Send code stays unchanged and t1_/t2_/t3_
// access is confined to this one function. No child-line id is ever synthesized.
function _roV2IsFlatDraft_(d) { return !!(d && Array.isArray(d.tiers) && d.scope); }
function _roV2NormalizeFlatDraft_(d) {
  var lines = {};
  (d.tiers || []).forEach(function (t) {
    var b = String(t.tier);
    lines[b] = {
      request_bucket: b, request_month: (t.month == null ? '' : String(t.month)),
      order_qty: t.orderQty, recommended_qty: t.recommendedQty,
      carton_qty: (t.cartonQty == null ? '' : t.cartonQty), note: (t.note == null ? '' : String(t.note)),
      line_status: (t.status == null ? 'draft' : String(t.status)),
      user_edited: t.userEdited === true, submitted_by: t.submittedBy, submitted_at: t.submittedAt
      // NO request_allocation_line_id — the flat model has no child-line identity.
    };
  });
  return {
    sku: (d.scope && d.scope.sku) || '', draftId: d.draftId, draftVersion: d.draftVersion,
    // F1-7N-FB-3B §C — the PERSISTED planning cycle is carried through: it is the Send's current-run authority
    // (_roSendPlanningCycle_ prefers it over any computed cycle, so a Send targets the run the page is showing).
    planningCycle: (d.planningCycle == null ? '' : String(d.planningCycle)),
    expectedToken: null, status: d.status, conflict: false, model: 'flat_v2', lines: lines
  };
}
// PURE Send-line builder from the flat DTO — delegates the eligible-tier authority to KMRDV2 (window.KM.requestDraftV2)
// when present, else an identical local projection (proven byte-equal by test). Zero/cancelled tiers skipped; no line id.
function _roV2BuildSendLinesFromFlat_(d) {
  try {
    var K = (typeof window !== 'undefined' && window.KM && window.KM.requestDraftV2) || (typeof KM !== 'undefined' && KM.requestDraftV2);
    if (K && typeof K.explodeSendRequestLinesFromDto === 'function') return K.explodeSendRequestLinesFromDto(d);
  } catch (e) {}
  var out = [];
  (d.tiers || []).forEach(function (t) {
    var q = Number(t.orderQty); if (!(q > 0)) return; if (t.status === 'cancelled') return;
    out.push({ sku: (d.scope && d.scope.sku) || '', company: (d.scope && d.scope.company) || '', country: (d.scope && d.scope.country) || '', marketplace: (d.scope && d.scope.marketplace) || '',
      request_bucket: t.tier, request_month: (t.month == null ? '' : String(t.month)), requested_qty: q,
      units_per_carton: (d.unitsPerCarton == null ? '' : d.unitsPerCarton), carton_qty: (t.cartonQty == null ? '' : t.cartonQty),
      request_allocation_draft_id: String(d.draftId) });
  });
  return out;
}
// __RO_EDIT_PURE_END__
// restrained toast (reuse the gap-recalc toast owner; alert fallback). No large new UI.
function _roNotify_(msg) {
  try { var gr = window.KM && window.KM.gapRecalc; if (gr && typeof gr.announceManualDone === 'function') { gr.announceManualDone(null, String(msg), null); return; } } catch (e) {}
  try { if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(String(msg)); } catch (e2) {}
}
// F1-7N-FA-3C-R6B — monotonic hydration guard: a LATE read-back response must never clobber a NEWER hydration or a
// user's in-progress edit. Each hydration start bumps the seq; a response applies only if it is still the newest.
var _roHydrateSeq = 0, _roHydrateReqCount = 0, _roLastAutosaveOutcome = null, _roLastEmptyReason = null;
// F1-7N-FA-3C-R6B1 — read-only, non-persistent debug snapshot (no secrets, no raw token). Exposed via window.__roDebug().
// R6B2 — adds useDb / searched / firstLayerSeq / lastEmptyReason so a live SPA-remount empty page can be pinpointed to
// the EXACT branch (LOADING transient · DB_UNAVAILABLE genuine disconnect · ERROR API failure · EMPTY_SCOPE real empty).
function _roDebugSnapshot_() {
  return { mountEpoch: _roMountEpoch, baseDataStatus: _roBaseDataStatus, hydrationStatus: _roHydrationStatus,
    useDb: (typeof _roUseDb === 'function') ? !!_roUseDb() : null, searched: !!(requestOrderState && requestOrderState.searched),
    firstLayerSeq: (typeof _opFirstLayerSeq === 'number') ? _opFirstLayerSeq : null, lastEmptyReason: _roLastEmptyReason,
    uniqueScopeCount: (typeof _roScopesFromLoadedData_ === 'function' ? _roScopesFromLoadedData_().length : 0),
    hydrationRequestCount: _roHydrateReqCount, cachedScopeCount: Object.keys(_roDraftDtoCache).length,
    canonicalDraftCount: Object.keys(_roCanonicalDraftBySku).length, pendingAutosaveCount: Object.keys(_roAutosaveTimers_ || {}).length,
    lastAutosaveOutcome: _roLastAutosaveOutcome, baseRowCount: (requestOrderState.data || []).length,
    // F1-7N-FA-3C-R6C — release signature + shared DB-provider state (so "is the deployed fix the code actually running,
    // and is the provider healthy after navigation?" is answerable from __roDebug alone). No secrets / no raw token.
    release: (typeof window !== 'undefined' && window.KM && window.KM.RELEASE) || null,
    dbProviderState: (typeof window !== 'undefined' && window.KM && window.KM.dbProvider && typeof window.KM.dbProvider.state === 'function') ? window.KM.dbProvider.state() : null };
}
// Read ONE scope's active drafts and ACCUMULATE into the passed maps (never a Draft write; never creates/regenerates a
// Draft; never a Draft-Line read/write — getActive reads request_order_allocation_drafts ONLY). Projects the flat DTO
// into the exact UI model (id/version/status/tier month/recommended/order/carton/status/note/user_edited/submitted).
function _roReadActiveDraftsForScope_(scope, accDrafts, accNoDraft, accSubmitted) {
  var db = window.KM && window.KM.DB;
  if (!db || typeof db.getActiveRequestOrderDrafts !== 'function' || !scope || !scope.company) return Promise.resolve(null);
  _roHydrateReqCount++;   // one getActive per unique scope (scope-based, NEVER per SKU)
  return Promise.resolve(db.getActiveRequestOrderDrafts(scope)).then(function (res) {
    var data = (res && res.data) || {};
    (data.drafts || []).forEach(function (d) {
      if (_roV2IsFlatDraft_(d)) { var fv = _roV2NormalizeFlatDraft_(d); var fsku = _roCanonKey_(fv.sku); if (fsku) accDrafts[fsku] = fv; return; }
      var h = d.header || {}; var sku = _roCanonKey_(h.sku); if (!sku) return;
      var lines = {}; (d.lines || []).forEach(function (l) { lines[String(l.request_bucket)] = l; });
      accDrafts[sku] = { draftId: h.request_allocation_draft_id, draftVersion: h.draft_version, expectedToken: null, status: h.status, conflict: false, lines: lines };
    });
    // fail closed on duplicate active matches — the natural-scope conflict is surfaced, never silently coalesced.
    (data.conflicts || []).forEach(function (c) { var sku = _roCanonKey_(c.sku); if (sku) accDrafts[sku] = { conflict: true, conflictIds: c.conflictIds || [] }; });
    (data.noDraftSkus || []).forEach(function (s) { var k = _roCanonKey_(s); if (k) accNoDraft[k] = true; });
    (data.submittedSkus || []).forEach(function (s) { var k = _roCanonKey_(s); if (k) accSubmitted[k] = true; });
    return data;
  }).catch(function () { return null; });
}
// Populate _roCanonicalDraftBySku from ONE scope-level getActive read (used by the AI Plan DONE path — REPLACES the
// map for that scope). Best-effort; never creates a draft; re-renders so the persisted Draft shows immediately.
function _roLoadCanonicalDraftsForScope_(scope) {
  if (!scope || !scope.company) return Promise.resolve(null);
  var mySeq = ++_roHydrateSeq, drafts = {}, noDraft = {}, submitted = {};
  return Promise.resolve(_roReadActiveDraftsForScope_(scope, drafts, noDraft, submitted)).then(function (data) {
    if (data == null) return null;
    if (mySeq !== _roHydrateSeq) return null;   // a newer hydration/edit started → drop this late response
    _roCanonicalDraftBySku = drafts; _roNoDraftSkus = noDraft; _roSubmittedSkus = submitted;
    if (typeof renderRequestOrderTable === 'function') { try { renderRequestOrderTable(); } catch (e) {} }
    return drafts;
  });
}
// F1-7N-FA-3C-R6B — hydrate the persisted flat Draft for EVERY concrete scope currently on screen (survives a refresh;
// requires NO AI Plan run). Read-only: zero Draft writes, zero version change, zero updated_at change, never opens the
// AI Plan Result popup. Accumulates across scopes, then applies under the seq guard.
function _roHydratePersistedDraftsForLoadedScopes_() {
  // F1-7N-FA-3C-R6B1 — dedupe identical scopes (scope-based, NEVER one request per SKU); run the reads in parallel (no
  // serial per-scope chain); a session cache lets a re-entry render the confirmed DTO immediately while a fresh read
  // refreshes in the background. Sets the LOADING/LOADED/ERROR status so the render shows a skeleton (never a blank
  // editable field) until the Draft resolves.
  var raw = _roScopesFromLoadedData_();
  if (!raw.length) { var s = _roCanonicalScope_(); if (s) raw = [s]; }
  var seenK = {}, scopes = [];
  raw.forEach(function (sc) { var k = _roScopeKey3_(sc); if (!seenK[k]) { seenK[k] = 1; scopes.push(sc); } });   // dedupe
  if (!scopes.length) { _roHydrationStatus = 'IDLE'; return Promise.resolve(null); }
  var mySeq = ++_roHydrateSeq, anyError = false;
  // INSTANT DISPLAY seed from the session cache (so a re-entry shows confirmed DTOs immediately). This seeds only the
  // rendered view — the FINAL applied state is rebuilt from the FRESH reads below, so a re-read that returns FEWER
  // drafts (a draft consumed/removed) correctly drops the stale cached row (never a merge-only stale keep).
  var seedD = {}, seedN = {}, seedS = {};
  scopes.forEach(function (sc) { var c = _roDraftDtoCache[_roScopeKey3_(sc)]; if (c) { Object.keys(c.drafts || {}).forEach(function (k) { seedD[k] = c.drafts[k]; }); Object.keys(c.noDraft || {}).forEach(function (k) { seedN[k] = c.noDraft[k]; }); Object.keys(c.submitted || {}).forEach(function (k) { seedS[k] = c.submitted[k]; }); } });
  var hadCache = Object.keys(seedD).length > 0 || Object.keys(seedN).length > 0;
  if (hadCache) { _roCanonicalDraftBySku = seedD; _roNoDraftSkus = seedN; _roSubmittedSkus = seedS; }
  _roHydrationStatus = hadCache ? 'LOADED' : 'LOADING';
  if (typeof renderRequestOrderTable === 'function') { try { renderRequestOrderTable(); } catch (e) {} }   // show skeleton (fresh) or cached (instant)
  return Promise.all(scopes.map(function (scope) {
    var d = {}, n = {}, sub = {};
    return Promise.resolve(_roReadActiveDraftsForScope_(scope, d, n, sub)).then(function (data) {
      if (data == null) { anyError = true; return null; }
      _roDraftDtoCache[_roScopeKey3_(scope)] = { drafts: d, noDraft: n, submitted: sub };   // replace this scope's confirmed DTOs
      return { d: d, n: n, sub: sub };
    });
  })).then(function (results) {
    if (mySeq !== _roHydrateSeq) return null;   // a newer hydration/edit superseded this run → drop the late result
    var drafts = {}, noDraft = {}, submitted = {};   // FINAL = the fresh reads ONLY (authoritative; drops removed drafts)
    results.forEach(function (r) { if (!r) return; Object.keys(r.d).forEach(function (k) { drafts[k] = r.d[k]; }); Object.keys(r.n).forEach(function (k) { noDraft[k] = r.n[k]; }); Object.keys(r.sub).forEach(function (k) { submitted[k] = r.sub[k]; }); });
    _roCanonicalDraftBySku = drafts; _roNoDraftSkus = noDraft; _roSubmittedSkus = submitted;
    _roHydrationStatus = (anyError && !Object.keys(drafts).length && !Object.keys(noDraft).length) ? 'ERROR' : 'LOADED';
    if (typeof renderRequestOrderTable === 'function') { try { renderRequestOrderTable(); } catch (e) {} }
    return drafts;
  }).catch(function () { if (mySeq === _roHydrateSeq) { _roHydrationStatus = 'ERROR'; if (typeof renderRequestOrderTable === 'function') { try { renderRequestOrderTable(); } catch (e) {} } } return null; });
}
function _roLoadCanonicalDraftsOnMount_() { return _roHydratePersistedDraftsForLoadedScopes_(); }
// Fetch + cache the optimistic-lock token for a draft (§3). Returns {draft_version, userEditFingerprint} or null.
function _roEnsureDraftToken_(sku) {
  var d = _roCanonicalDraftBySku[_roCanonKey_(sku)];
  if (!d || !d.draftId) return Promise.resolve(null);
  if (d.expectedToken) return Promise.resolve(d.expectedToken);
  var db = window.KM && window.KM.DB;
  if (!db || typeof db.getRecommendationDraftToken !== 'function') return Promise.resolve(null);
  return Promise.resolve(db.getRecommendationDraftToken('MONTHLY_ORDER', d.draftId)).then(function (res) {
    var tok = (res && res.data && res.data.expectedToken) || null; if (tok) d.expectedToken = tok; return tok;
  }).catch(function () { return null; });
}
// Persist ONE committed order_qty to the canonical draft via the LOCKED decision writer. Optimistic-lock:
// CONCURRENCY/VERSION conflict → reload the latest draft + notify (never overwrite newer state); terminal/blocked →
// mark the row blocked. Success → update the local execution value + force a token refresh (version bumped).
function _roSaveOrderQtyToCanonicalDraft_(sku, bucket, orderQty, input) {
  return _roSaveTierEditToCanonicalDraft_(sku, bucket, { order_qty: orderQty }, input);
}
// F1-7N-FA-3C-R6B — subtle per-field autosave state without layout change (classes only; no modal, no reflow).
function _roSetFieldState_(input, state, title) {
  if (!input || !input.classList) return;
  ['is-saving', 'is-saved', 'is-conflict', 'is-invalid'].forEach(function (c) { input.classList.remove(c); });
  if (state) input.classList.add(state);
  if (title !== undefined) input.title = title;
}
// F1-7N-FA-3C-R6B — the ONE inline autosave writer for a canonical-draft tier. patch = {order_qty?, note?}. Uses the
// existing optimistic token/version contract via the LOCKED decision writer. Success → update the local DTO field +
// null the token so the NEXT edit re-fetches the advanced token (one successful edit ⇒ one token advance). Stale token
// → NO silent overwrite: inline Conflict/Retry state + re-read the latest Draft; the caller preserves the typed value.
// F1-7N-FA-3C-R6B1 — per-Draft edit SERIALIZATION: concurrent edits for the SAME draft (e.g. Order Qty then Note)
// run strictly one-after-another so an earlier cached token can never race a later one into a self-conflict. Each
// save chains onto the prior save for that draftId; the queue self-cleans when idle.
var _roDraftEditQueue_ = {};
// F1-7N-FA-3C-R6B2 — SHAPE-AGNOSTIC edit-result classifier. The live MONTHLY_ORDER cutover routes edits to the FLAT V2
// core (KMRDV2P.editMonthlyFlat) whose result is { success, wrote, outcome:'EDITED'|'CONFLICT'|'NOT_EXECUTED',
// results:[{tier,ok,reason}], result:{writeOutcome} } — it carries NO `status:'COMPLETED'` field. The pre-R6B2 core
// gated success SOLELY on `d.status === 'COMPLETED'`, so under the live cutover EVERY committed flat edit was misread as
// "Save failed": the note/version was never adopted AND the cached token was never nulled — so a following edit reused a
// stale token and the backend rejected it as a CONFLICT (root cause: notes never persisted, version stuck). This reads
// BOTH shapes truthfully: LEGACY { status:'COMPLETED'|'CONFLICT'|'BLOCKED_CONFLICT'|'FAILED', reason } and FLAT
// { wrote, outcome, results[], result.writeOutcome }. A committed-but-unverified flat write (WRITE_COMMITTED_READBACK_
// FAILED) is NEVER reported as a clean Saved (truthful write semantics, R5C) — it triggers a reconciling re-read.
function _roClassifyEditResult_(res) {
  var d = (res && res.data) || (res && res.error && res.error.details) || {};
  var out = (d && d.result) || {};
  var status = String(d.status || '');
  var outcome = String(d.outcome || '');
  var writeOutcome = String(out.writeOutcome || '');
  var tierReason = '';
  if (Array.isArray(d.results)) { for (var i = 0; i < d.results.length; i++) { var rr = d.results[i]; if (rr && rr.ok === false && rr.reason) { tierReason = String(rr.reason); break; } } }
  var reason = String(d.reason || tierReason || (res && res.error && res.error.code) || d.error || '');
  var wroteFlat = d.wrote === true && outcome === 'EDITED';
  var okLegacy = status === 'COMPLETED';
  var backendOk = !!(res && res.success) && (okLegacy || wroteFlat);
  var committedUnverified = backendOk && writeOutcome === 'WRITE_COMMITTED_READBACK_FAILED';
  var cleanSaved = backendOk && !committedUnverified && (writeOutcome === '' || writeOutcome === 'WRITE_COMMITTED_VERIFIED');
  var conflict = !backendOk && (outcome === 'CONFLICT' || status === 'CONFLICT' || /CONCURRENCY_TOKEN_MISMATCH|VERSION_CONFLICT|TOKEN_MISMATCH/.test(reason));
  var terminal = !backendOk && (status === 'BLOCKED_CONFLICT' || /IMMUTABLE_TERMINAL_STATUS|BLOCKED_CONFLICT|TIER_TERMINAL/.test(reason));
  // adopt-forward token: the confirmed response may carry the NEXT valid optimistic token (skips the pre-write fetch on
  // the next edit). Absent → the caller nulls the cached token so the next edit re-fetches the advanced token.
  var nextToken = d.expectedToken || (out && out.expectedToken) || null;
  return { cleanSaved: cleanSaved, committedUnverified: committedUnverified, conflict: conflict, terminal: terminal,
    reason: reason, draftVersion: d.draftVersion, nextToken: nextToken };
}
// F1-7N-FB-3C §B — THE USER-AUTHORIZED DRAFT-CREATION BOUNDARY, applied at the exact point where the old rule
// silently dropped the user's work. Until now this function returned null when no canonical draft existed, so a
// deliberate quantity typed onto a never-materialized SKU wrote NOTHING and that SKU stayed permanently
// unsendable (Send consumes persisted drafts only). The user has resolved the standing rule: AI Plan is the
// INITIAL/DEFAULT draft source but NOT the exclusive creation boundary, and a deliberate user quantity edit is
// ALSO an authorized canonical creation/update boundary.
//
// So an order_qty edit with no existing draft now routes to the canonical create-then-persist-then-read-back
// server action, which mints the canonical 'RD::MONTHLY_ORDER::<cycle>::…' identity through KMRDV2 (never a
// 'RAD-M-…'), and creation happens HERE rather than being deferred to Send.
//
// NOT WIDENED: only an ORDER QUANTITY creates a draft. A note-only edit on a SKU with no draft still does
// nothing, because a note is not an order decision and creating a draft from one would materialize rows
// nobody asked for.
function _roSaveTierEditToCanonicalDraft_(sku, bucket, patch, input) {
  var ref0 = _roCanonicalRowFor_(sku, bucket);
  if (!ref0) {
    var hasQty = patch && Object.prototype.hasOwnProperty.call(patch, 'order_qty')
      && patch.order_qty != null && patch.order_qty !== '';
    if (!hasQty) return Promise.resolve(null);   // note-only on a draft-less SKU → unchanged in-memory behavior
    return _roCreateCanonicalDraftFromEdit_(sku, bucket, Number(patch.order_qty), patch, input);
  }
  var qk = String(ref0.draft.draftId);
  var prior = _roDraftEditQueue_[qk] || Promise.resolve();
  var run = prior.then(function () { return _roSaveTierEditCore_(sku, bucket, patch, input); }, function () { return _roSaveTierEditCore_(sku, bucket, patch, input); });
  _roDraftEditQueue_[qk] = run.catch(function () {});   // the NEXT edit for this draft chains after this one settles (success or failure)
  return run;
}
// §B.2 — create the canonical Flat-V2 draft DURING the edit/save, persist the user quantity, read it back and
// adopt the returned internal id into the page's canonical map so the row behaves like any other persisted
// draft from this point on (including being visible to Send). Failure leaves the field visibly UNSAVED, which
// is what blocks Send — never a silent local-only value.
function _roCreateCanonicalDraftFromEdit_(sku, bucket, orderQty, patch, input) {
  var db = window.KM && window.KM.DB;
  if (!db || typeof db.ensureAndEditAllocationDraft !== 'function') return Promise.resolve(null);
  var item = _roFindRowBySku_(sku);
  if (!item) return Promise.resolve(null);
  var cycle = (typeof _roSendPlanningCycle_ === 'function') ? _roSendPlanningCycle_() : '';
  if (!cycle) { _roSetFieldState_(input, 'is-invalid', 'No planning cycle — press Search first'); _roLastAutosaveOutcome = 'FAILED'; return Promise.resolve(null); }
  var mo = (typeof _roBucketMonthObj === 'function') ? _roBucketMonthObj(bucket) : null;
  var month = mo ? (mo.year + '-' + String(mo.idx + 1).padStart(2, '0')) : cycle;
  _roSetFieldState_(input, 'is-saving', 'Saving…');
  return Promise.resolve(db.ensureAndEditAllocationDraft({ payload: {
    planning_cycle: cycle,
    scope: { company: item.company || '', country: item.country || '', marketplace: item.marketplace || '',
      sku: sku, draft_purpose: 'regular' },
    tier: bucket, request_month: month, order_qty: Number(orderQty),
    units_per_carton: (item.boxSize == null ? '' : item.boxSize),
    note: (patch && patch.note != null) ? String(patch.note) : undefined,
    actor: 'request-order'
  } })).then(function (res) {
    var d = (res && res.data) || {};
    if (!res || res.success !== true || !d.request_allocation_draft_id || d.verified !== true) {
      _roSetFieldState_(input, 'is-invalid', 'Save failed — retry');
      _roLastAutosaveOutcome = 'FAILED';
      return { ok: false, reason: String((res && res.error && res.error.code) || 'ALLOCATION_DRAFT_CREATE_FAILED') };
    }
    // §B.5 — the wire carries the proof; refuse to adopt a non-canonical identity even if one were returned.
    if (d.canonical_identity !== true) {
      _roSetFieldState_(input, 'is-invalid', 'Save rejected — non-canonical draft identity');
      _roLastAutosaveOutcome = 'FAILED';
      return { ok: false, reason: 'NON_CANONICAL_DRAFT_IDENTITY' };
    }
    // Adopt the persisted draft into the page's canonical map so the very next edit takes the ordinary
    // update path, and so the row is immediately eligible for Send.
    var k = _roCanonKey_(sku);
    var entry = _roCanonicalDraftBySku[k] || { draftId: '', lines: {} };
    entry.draftId = String(d.request_allocation_draft_id);
    entry.draftVersion = d.draft_version;
    entry.planningCycle = String(d.planning_cycle || cycle);
    entry.status = String(d.status || 'draft');
    entry.conflict = false;
    entry.model = 'flat_v2';
    entry.expectedToken = null;                       // force a fresh token on the next edit
    entry.lines = entry.lines || {};
    entry.lines[String(bucket)] = { request_bucket: String(bucket), request_month: month,
      order_qty: Number(d.persisted_order_qty), recommended_qty: '', line_status: 'draft', user_edited: true };
    _roCanonicalDraftBySku[k] = entry;
    if (_roNoDraftSkus && _roNoDraftSkus[k]) delete _roNoDraftSkus[k];
    _roSetFieldState_(input, 'is-saved', 'Saved');
    _roLastAutosaveOutcome = 'SAVED';
    return { ok: true, reason: d.created ? 'CREATED' : 'UPDATED', draftId: entry.draftId,
      sendable_tier: d.sendable_tier === true };
  }).catch(function () {
    _roSetFieldState_(input, 'is-invalid', 'Save failed — retry');
    _roLastAutosaveOutcome = 'ERROR';
    return { ok: false, reason: 'ERROR' };
  });
}
// Locate the loaded page row for a SKU (the scope fields for the canonical draft identity come from it, never
// from the input element). Uses the UNFILTERED page data so a display filter cannot hide a row from its own save.
function _roFindRowBySku_(sku) {
  var want = _roCanonKey_(sku);
  var all = (requestOrderState && requestOrderState.data) || [];
  for (var i = 0; i < all.length; i++) { if (_roCanonKey_(all[i] && all[i].sku) === want) return all[i]; }
  return null;
}
function _roSaveTierEditCore_(sku, bucket, patch, input) {
  var ref = _roCanonicalRowFor_(sku, bucket);
  if (!ref) return Promise.resolve(null);
  var db = window.KM && window.KM.DB;
  if (!db || typeof db.updateRecommendationDecisionLocked !== 'function') return Promise.resolve(null);
  var month = ref.line.request_month;
  _roSetFieldState_(input, 'is-saving', 'Saving…');
  return _roEnsureDraftToken_(sku).then(function (tok) {
    if (!tok) { _roSetFieldState_(input, 'is-invalid', 'Save failed — retry'); return null; }
    var cmd = _roBuildTierEditCommand_(ref.draft.draftId, month, bucket, patch, tok);
    return Promise.resolve(db.updateRecommendationDecisionLocked(cmd)).then(function (res) {
      // F1-7N-FA-3C-R6B2 — interpret BOTH the legacy AND the live flat-V2 edit result shapes (see _roClassifyEditResult_).
      var cls = _roClassifyEditResult_(res);
      var reason = cls.reason;
      if (cls.cleanSaved) {
        if (Object.prototype.hasOwnProperty.call(patch, 'order_qty') && patch.order_qty != null && patch.order_qty !== '') ref.line.order_qty = Number(patch.order_qty);
        if (Object.prototype.hasOwnProperty.call(patch, 'note')) ref.line.note = String(patch.note == null ? '' : patch.note);   // blank persists as ''
        if (cls.draftVersion != null) ref.draft.draftVersion = cls.draftVersion;   // adopt the confirmed advanced version (when supplied)
        ref.draft.expectedToken = cls.nextToken || null;   // adopt the next token if returned; else null → next edit re-fetches
        _roSetFieldState_(input, 'is-saved', 'Saved'); _roLastAutosaveOutcome = 'SAVED';
      } else if (cls.committedUnverified) {
        // R5C truthful semantics — the row committed but its post-write readback failed. NEVER a clean "Saved". Adopt the
        // value locally (it IS committed; the deterministic id keeps a re-run idempotent) but reconcile via a fresh read.
        if (Object.prototype.hasOwnProperty.call(patch, 'note')) ref.line.note = String(patch.note == null ? '' : patch.note);
        if (Object.prototype.hasOwnProperty.call(patch, 'order_qty') && patch.order_qty != null && patch.order_qty !== '') ref.line.order_qty = Number(patch.order_qty);
        ref.draft.expectedToken = null; _roLastAutosaveOutcome = 'COMMITTED_UNVERIFIED';
        _roSetFieldState_(input, 'is-conflict', 'Saved — verifying…');
        _roLoadCanonicalDraftsForScope_(_roCanonicalScope_());
      } else if (cls.conflict) {
        _roSetFieldState_(input, 'is-conflict', 'Changed elsewhere — press Enter to retry'); _roLastAutosaveOutcome = 'CONFLICT';   // NO silent DB overwrite
        ref.draft.expectedToken = null;                                   // force a fresh token on retry
        _roLoadCanonicalDraftsForScope_(_roCanonicalScope_());            // re-read the current Draft (typed value preserved by the caller)
      } else if (cls.terminal) {
        _roSetFieldState_(input, 'is-invalid', 'Draft conflict — review required'); _roLastAutosaveOutcome = 'BLOCKED';
      } else {
        _roSetFieldState_(input, 'is-invalid', 'Save failed — retry'); _roLastAutosaveOutcome = 'FAILED';
      }
      return { ok: cls.cleanSaved, reason: reason };
    });
  }).catch(function () { _roSetFieldState_(input, 'is-invalid', 'Save failed — retry'); _roLastAutosaveOutcome = 'ERROR'; return null; });
}
// F1-7N-FA-3C-R6B — per-input debounce (avoid one write per keystroke) + immediate flush on blur/Enter. The debounced
// callback always sends the LATEST intended value (the closure reads the input live at fire time).
var _roAutosaveTimers_ = {};
function _roAutosaveKey_(input) { return [input && input.dataset && input.dataset.sku, input && input.dataset && input.dataset.bucket, input && input.dataset && input.dataset.field].join('|'); }
function _roAutosaveDebounce_(input, fn, ms) {
  var k = _roAutosaveKey_(input);
  if (_roAutosaveTimers_[k]) { clearTimeout(_roAutosaveTimers_[k]); }
  _roAutosavePending_[k] = fn;   // R6C — recorded so an unmount can flush a still-pending write (Objective E)
  _roAutosaveTimers_[k] = setTimeout(function () { delete _roAutosaveTimers_[k]; delete _roAutosavePending_[k]; fn(); }, (typeof ms === 'number' ? ms : 600));
}
function _roAutosaveFlush_(input, fn) {
  var k = _roAutosaveKey_(input);
  if (_roAutosaveTimers_[k]) { clearTimeout(_roAutosaveTimers_[k]); delete _roAutosaveTimers_[k]; }
  delete _roAutosavePending_[k];
  fn();
}
// F1-7N-FA-3C-R6C (Objective E) — on navigation/unmount, immediately fire every PENDING debounced autosave so a route
// change never silently drops a pending Note write. Each stored callback reads the input live + goes through the SAME
// serialized writer + optimistic token, so a failed edit is never shown as Saved and no duplicate write is created. This
// is fire-and-forget (navigation is never blocked). `_roAutosavePending_` maps the timer key → its callback.
var _roAutosavePending_ = {};
function _roFlushPendingAutosaveOnUnmount_() {
  var keys = Object.keys(_roAutosaveTimers_ || {});
  keys.forEach(function (k) {
    var t = _roAutosaveTimers_[k]; if (t) { try { clearTimeout(t); } catch (e) {} }
    delete _roAutosaveTimers_[k];
    var fn = _roAutosavePending_[k]; delete _roAutosavePending_[k];
    if (typeof fn === 'function') { try { fn(); } catch (e2) {} }
  });
}
if (typeof window !== 'undefined') {
  window._roBuildOrderQtyEditCommand_ = _roBuildOrderQtyEditCommand_;
  window._roV2IsFlatDraft_ = _roV2IsFlatDraft_;                     // F1-7N-FA-3C-R2b-3 — flat-DTO normalization seam
  window._roV2NormalizeFlatDraft_ = _roV2NormalizeFlatDraft_;
  window._roV2BuildSendLinesFromFlat_ = _roV2BuildSendLinesFromFlat_;
  window._roRowOrderQtyDisplay_ = _roRowOrderQtyDisplay_;
  window._roLoadCanonicalDraftsForScope_ = _roLoadCanonicalDraftsForScope_;
  window._roHydratePersistedDraftsForLoadedScopes_ = _roHydratePersistedDraftsForLoadedScopes_;   // F1-7N-FA-3C-R6B reload hydration
  window._roScopesFromLoadedData_ = _roScopesFromLoadedData_;
  window._roDraftUiState_ = _roDraftUiState_;   // F1-7N-FA-3C-R6B1 per-SKU allocation state
  window.__roDebug = _roDebugSnapshot_;          // F1-7N-FA-3C-R6B1 read-only observability (no secrets/token)
  window._roBuildTierEditCommand_ = _roBuildTierEditCommand_;
  window._roSaveTierEditToCanonicalDraft_ = _roSaveTierEditToCanonicalDraft_;
  window._roCreateCanonicalDraftFromEdit_ = _roCreateCanonicalDraftFromEdit_;   // F1-7N-FB-3C §B
  window._roFindRowBySku_ = _roFindRowBySku_;
  window._roClassifyEditResult_ = _roClassifyEditResult_;   // F1-7N-FA-3C-R6B2 — shape-agnostic edit-result classifier
  window._roSiteConfirmRequired = _roSiteConfirmRequired;   // F1-7N-FA-3C-R6E-P0 — Site Confirm requirement (flag mirror)
  window._roRowNoteDisplay_ = _roRowNoteDisplay_;
  window._roSaveOrderQtyToCanonicalDraft_ = _roSaveOrderQtyToCanonicalDraft_;
  window._roIsCanonicalDraftSku_ = _roIsCanonicalDraftSku_;
  window._roIsNoDraftSku_ = _roIsNoDraftSku_;
  window._roClearAiPlanResult_ = _roClearAiPlanResult_;   // F1-7N-FA-3C-PRE3-R2 — dismiss button + scope-change/new-run clear
}

// ============================================================
// F1-4B-FM6-R4E3 — AI Plan → canonical resumable draft job → DB read-back → editable Order Allocation.
// The AI Plan action drives ONE logical scope job through the EXISTING R4E2-B2 backend (start → poll continue to
// terminal → ONE getActive), then renders Order Allocation from the PERSISTED drafts (execution authority). There is
// NO browser per-SKU fan-out (the backend job slices SKUs; the browser issues 1 start + N bounded continues + 1
// getActive), NO second job/persister/edit-writer, NO gap/factory/shipment recompute. Order Qty edits still flow
// through the R4E3-PRE locked decision writer. KMREC stays display-only. Send Request is NOT touched (R4E4/R4E5).
// ============================================================
var _roAiPlanBusy = false;          // one logical AI Plan job driven at a time (§3 — no duplicate start / no fan-out)
var _roAiPlanRunId = null;          // active backend runId (echoed to continue/cancel; the job state is single + global)
var _roAiPlanTotal = 0;             // snapshot SKU total for restrained "N / M" progress
var _roAiPlanCancelRequested = false;
var _RO_AI_PLAN_CONTINUE_DELAY_MS = 350;   // one continuation at a time (never a per-SKU burst)
var _RO_AI_PLAN_BUSY_RETRY_MS = 900;       // §3 respect a live lease held by another continuation → wait, retry
// F1-7N-FA-3C-R5D — MANUAL-ONLY result authority. The AI Plan Result popup belongs ONLY to an explicit current-session
// USER click (handleRequestOrderAiPlan → _roRunAiPlanJob_). A SYSTEM_RESUME/BACKGROUND drive (_roResumeAiPlanJobOnMount_)
// and any non-manual driver run silently — no popup, no toast, no restored result. `_roAiPlanManualToken` is a monotonic
// per-manual-run id so a late response from a superseded/older run can never overwrite a newer manual result.
var _roAiPlanManualToken = 0;              // ++ only on an explicit manual run; a run captures its own token
var _roAiPlanKeydownBound = false;         // Escape-to-close is bound once (repeated mount/unmount never duplicates it)
function _roAiPlanShouldShowResult_(ctx) { return !!(ctx && ctx.manual === true && ctx.token === _roAiPlanManualToken); }

// --- PURE dispositions (testable; consume the KM.DB adapter envelope) ---------------------------------------
// START disposition: RUN (fresh or resumed same-scope) | BUSY (another scope's single-slot job) | FAIL (truthful code).
function _roAiPlanStartDisposition_(res) {
  if (!res || !res.success) return { action: 'FAIL', code: (res && res.error && res.error.code) || 'AI_PLAN_START_FAILED' };
  var d = res.data || {};
  if (d.alreadyRunning && d.busy) return { action: 'BUSY', code: 'ANOTHER_JOB_RUNNING' };   // different scope owns the one slot
  return { action: 'RUN', runId: d.runId || null, total: d.total || 0, resumed: !!d.alreadyRunning };
}
// CONTINUE disposition: DONE | FAILED (fail closed — never treated as success) | CANCELLED | BUSY | MORE | NONE.
function _roAiPlanContinueDisposition_(res) {
  if (!res || !res.success) return { action: 'FAIL', code: (res && res.error && res.error.code) || 'AI_PLAN_CONTINUE_FAILED' };
  var d = res.data || {};
  if (d.busy) return { action: 'BUSY' };
  if (d.status === 'DONE') return { action: 'DONE', done: d.cursor || 0, total: d.total || 0, counts: d.counts || null, reasonCounts: d.reasonCounts || null, reasonSamples: d.reasonSamples || null };
  if (d.status === 'FAILED') return { action: 'FAILED', code: d.lastError || 'FAILED', counts: d.counts || null, reasonCounts: d.reasonCounts || null, reasonSamples: d.reasonSamples || null };   // GAP_GENERATION_CHANGED, etc.
  if (d.status === 'CANCELLED') return { action: 'CANCELLED', counts: d.counts || null, reasonCounts: d.reasonCounts || null, reasonSamples: d.reasonSamples || null };
  if (d.status === 'NONE') return { action: 'NONE' };
  if (d.hasMore || (d.cursor != null && d.total != null && d.cursor < d.total)) return { action: 'MORE', done: d.cursor || 0, total: d.total || 0 };
  return { action: 'DONE', done: d.cursor || 0, total: d.total || 0, counts: d.counts || null, reasonCounts: d.reasonCounts || null, reasonSamples: d.reasonSamples || null };
}
// PURE truthful terminal-count message (§ observability, F1-7N-FA-3C-PRE3-R1). Consumes the job's canonical terminal
// `counts` bucket ({created,reused,regenerated,needsConfirmation,blockedConflict,notReady,failed}) and NEVER reports a
// blanket success: success is created+reused+regenerated. When that is 0 it states 0 drafts were created and that
// Order Allocation was not updated; a partial run surfaces both the successful and the unsuccessful buckets. A null
// counts (older backend that does not expose counts) falls back to the prior neutral completion message.
function _roAiPlanDoneMsg_(counts) {
  if (!counts) return 'AI Plan completed. Order Allocation has been updated.';
  function n(v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0; }
  var created = n(counts.created), reused = n(counts.reused), regenerated = n(counts.regenerated);
  var needsConfirmation = n(counts.needsConfirmation), blockedConflict = n(counts.blockedConflict);
  var notReady = n(counts.notReady), failed = n(counts.failed);
  var success = created + reused + regenerated;
  var parts = [created + ' created'];
  if (reused) parts.push(reused + ' reused');
  if (regenerated) parts.push(regenerated + ' regenerated');
  if (needsConfirmation) parts.push(needsConfirmation + ' need confirmation');
  if (blockedConflict) parts.push(blockedConflict + ' blocked');
  if (notReady) parts.push(notReady + ' not ready');
  if (failed) parts.push(failed + ' failed');
  var summary = parts.join(', ');
  if (success === 0) return 'AI Plan completed but created 0 drafts (' + summary + '). Order Allocation was not updated.';
  if (needsConfirmation + blockedConflict + notReady + failed > 0) return 'AI Plan completed with issues: ' + summary + '. Review Order Allocation.';
  return 'AI Plan completed: ' + summary + '. Order Allocation has been updated.';
}
// PURE truthful terminal message (never converts a backend failure into a success — §4).
function _roAiPlanFailMsg_(code) {
  var c = String(code == null ? '' : code);
  if (/GAP_GENERATION_CHANGED/.test(c)) return 'Order Planning data changed during AI Plan. Recalculate the gap, then run AI Plan again. (No partial result was applied.)';
  if (/ORDER_PLANNING_GAP_NOT_READY/.test(c)) return 'The Order Planning gap is not ready yet. Recalculate it first, then run AI Plan.';
  if (/REQUEST_ORDER_DRAFT_EMPTY_SCOPE/.test(c)) return 'No eligible SKUs for AI Plan in this scope.';
  if (/REQUEST_ORDER_DRAFT_JOB_STATE_LIMIT/.test(c)) return 'This scope is too large for one AI Plan run. Narrow the scope, then try again.';
  if (/ANOTHER_JOB_RUNNING/.test(c)) return 'Another AI Plan is still running. Please wait for it to finish.';
  if (/LOCK_UNAVAILABLE/.test(c)) return 'AI Plan is briefly busy. Please try again in a moment.';
  return 'AI Plan could not be completed (' + (c || 'unknown') + '). No partial result was applied.';
}
// PURE scope equality (company/country/marketplace) — used to decide §16 resume ownership.
function _roAiPlanScopeMatches_(a, b) {
  if (!a || !b) return false;
  function n(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  return n(a.company) === n(b.company) && n(a.country) === n(b.country) && n(a.marketplace) === n(b.marketplace);
}

// --- restrained progress UI (§5) — the AI Support trigger shows the running state; a contextual Cancel appears only
// while active and is hidden on terminal. No permanent debug Cancel is added to the toolbar. -------------------
function _roAiPlanTrigger_() { return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('roAiSupportTrigger') : null; }
function _roAiPlanCancelBtn_() { return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('ro-ai-plan-cancel-btn') : null; }
function _roAiPlanSetProgress_(text, running) {
  var t = _roAiPlanTrigger_();
  if (t) { if (running) { if (t.dataset && t.dataset.idleLabel == null) t.dataset.idleLabel = t.textContent; t.textContent = '✦ ' + text; t.setAttribute('aria-busy', 'true'); } }
  var c = _roAiPlanCancelBtn_(); if (c) { c.style.display = running ? '' : 'none'; if (running) c.disabled = false; }
}
function _roAiPlanResetUi_() {
  _roAiPlanBusy = false; _roAiPlanRunId = null; _roAiPlanTotal = 0; _roAiPlanCancelRequested = false;
  var t = _roAiPlanTrigger_();
  if (t) { var idle = (t.dataset && t.dataset.idleLabel) ? t.dataset.idleLabel : '✦ AI Support'; t.textContent = idle; t.removeAttribute('aria-busy'); if (t.dataset) delete t.dataset.idleLabel; }
  var c = _roAiPlanCancelBtn_(); if (c) { c.style.display = 'none'; c.disabled = false; }
}

// --- PERSISTENT AI Plan result panel (F1-7N-FA-3C-PRE3-R2) — a transient toast was not reliably seen; keep a durable
// truthful terminal summary (counts + bounded reason distribution) near AI Support until the next run or scope change.
var _roAiPlanResult = null;   // { kind, processed, total, counts, reasonCounts, reasonSamples, code, scopeKey }
function _roAiPlanScopeKey_(scope) {
  function n(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  return scope ? (n(scope.company) + '||' + n(scope.country) + '||' + n(scope.marketplace)) : '';
}
function _roAiPlanNum_(v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0; }
// PURE — a stored result is shown ONLY for the currently-displayed AI Plan scope (so a scope change hides a stale result).
function _roAiPlanResultVisibleFor_(result, scope) {
  return !!(result && result.scopeKey && result.scopeKey === _roAiPlanScopeKey_(scope));
}
function _roClearAiPlanResult_() { _roAiPlanResult = null; _roRenderAiPlanResult_(); }
function _roSetAiPlanResult_(kind, disp, scope) {
  var c = (disp && disp.counts) || {};
  _roAiPlanResult = {
    kind: kind,
    processed: (disp && typeof disp.done === 'number') ? disp.done : ((disp && disp.total) || 0),
    total: (disp && disp.total) || 0,
    counts: { created: _roAiPlanNum_(c.created), reused: _roAiPlanNum_(c.reused), regenerated: _roAiPlanNum_(c.regenerated),
      needsConfirmation: _roAiPlanNum_(c.needsConfirmation), blockedConflict: _roAiPlanNum_(c.blockedConflict),
      notReady: _roAiPlanNum_(c.notReady), committedUnverified: _roAiPlanNum_(c.committedUnverified), failed: _roAiPlanNum_(c.failed) },
    reasonCounts: (disp && disp.reasonCounts && typeof disp.reasonCounts === 'object') ? disp.reasonCounts : {},
    reasonSamples: (disp && disp.reasonSamples && typeof disp.reasonSamples === 'object') ? disp.reasonSamples : {},
    code: (disp && disp.code) || null,
    scopeKey: _roAiPlanScopeKey_(scope)
  };
  _roRenderAiPlanResult_();
}
function _roAiPlanResultEl_() {
  if (typeof document === 'undefined' || !document.getElementById) return null;
  var el = document.getElementById('ro-ai-plan-result');
  if (!el) {   // F1-7N-FA-3C-R5D — create-if-missing as a FIXED bottom-right toast on <body> (position:fixed → NO page
    // reflow / layout shift; independent of the Order Planning table). Single id → repeated mount never duplicates it.
    var host = (document.body || (document.getElementById('roAiSupportMenu') && document.getElementById('roAiSupportMenu').parentNode));
    if (host) { el = document.createElement('div'); el.id = 'ro-ai-plan-result'; el.className = 'ro-ai-plan-result'; el.setAttribute('aria-live', 'polite'); el.hidden = true; host.appendChild(el); }
  }
  // Escape-to-close, bound ONCE on document (repeated mount/unmount never duplicates the listener).
  if (!_roAiPlanKeydownBound && typeof document.addEventListener === 'function') {
    _roAiPlanKeydownBound = true;
    document.addEventListener('keydown', function (e) {
      var key = e && (e.key || e.keyCode);
      if (key === 'Escape' || key === 'Esc' || key === 27) {
        var node = document.getElementById('ro-ai-plan-result');
        if (node && !node.hidden) { _roClearAiPlanResult_(); }
      }
    });
  }
  return el || null;
}
// F1-7N-FA-3C-R5D — user-facing reason mapping (never show a raw technical token as the PRIMARY message).
var _RO_AI_PLAN_REASON_LABELS_ = { NON_ACTIONABLE_ZERO_RECOMMENDATION: 'No order needed — all recommended quantities are 0.' };
function _roAiPlanReasonLabel_(code) { return _RO_AI_PLAN_REASON_LABELS_[String(code)] || null; }
// PURE severity (R5D). error: Failed>0 OR committedUnverified>0 (reconciliation). warn: needsConfirmation>0 OR blocked>0.
// ok: any successful draft. info (neutral): only "No order needed" (zero-recommendation is NOT an error). Never color the
// whole result an error merely because No order needed > 0.
function _roAiPlanSeverity_(c) {
  c = c || {};
  function n(v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0; }
  var success = n(c.created) + n(c.reused) + n(c.regenerated);
  if (n(c.failed) > 0 || n(c.committedUnverified) > 0) return 'bad';
  if (n(c.needsConfirmation) > 0 || n(c.blockedConflict) > 0) return 'warn';
  if (success > 0) return 'ok';
  if (n(c.notReady) > 0) return 'info';
  return 'ok';
}
function _roRenderAiPlanResult_() {
  var el = _roAiPlanResultEl_(); if (!el) return;
  var r = _roAiPlanResult, scope = (typeof _roCanonicalScope_ === 'function') ? _roCanonicalScope_() : null;
  if (!_roAiPlanResultVisibleFor_(r, scope)) { el.hidden = true; el.innerHTML = ''; return; }
  var c = r.counts, success = c.created + c.reused + c.regenerated, total = r.total || r.processed || 0;
  var tone = _roAiPlanSeverity_(c);
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]; }); };
  // R5D user-facing rows — "Not ready" is renamed "No order needed" (the zero-recommendation bucket).
  var rows = [['Processed', total], ['Created', c.created], ['Reused', c.reused], ['Regenerated', c.regenerated],
    ['Needs confirmation', c.needsConfirmation], ['Blocked', c.blockedConflict], ['No order needed', c.notReady], ['Failed', c.failed]];
  var html = '<div class="ro-ai-plan-result__head"><span>AI Plan Result</span>' +
    '<button type="button" class="ro-ai-plan-result__x" onclick="_roClearAiPlanResult_()" aria-label="Close AI Plan result">×</button></div>';
  html += '<div class="ro-ai-plan-result__grid">';
  rows.forEach(function (kv) { html += '<span class="k">' + esc(kv[0]) + '</span><span class="v">' + esc(kv[1]) + '</span>'; });
  html += '</div>';
  // primary human message (never a raw token). Error case names reconciliation explicitly.
  var primary = '';
  if (tone === 'bad') { primary = (c.committedUnverified > 0) ? ('Reconciliation required — ' + c.committedUnverified + ' draft(s) committed but unverified.') : (c.failed + ' failed — no partial result was applied.'); }
  else if (c.notReady > 0 && success === 0 && c.needsConfirmation === 0 && c.blockedConflict === 0) { primary = _roAiPlanReasonLabel_('NON_ACTIONABLE_ZERO_RECOMMENDATION'); }
  else if (c.notReady > 0) { primary = c.notReady + ' with no order needed (recommended quantity 0).'; }
  if (primary) html += '<div class="ro-ai-plan-result__msg">' + esc(primary) + '</div>';
  // technical tokens stay in a COLLAPSED optional section (diagnostics only) — never the primary message.
  var reasons = (r.reasonCounts && typeof r.reasonCounts === 'object') ? Object.keys(r.reasonCounts) : [];
  if (reasons.length) {
    html += '<details class="ro-ai-plan-result__reasons"><summary class="rh">Technical details</summary>';
    html += reasons.map(function (code) {
      var friendly = _roAiPlanReasonLabel_(code), samp = (r.reasonSamples && r.reasonSamples[code]) || [];
      var s = samp.length ? ' (' + esc(samp.slice(0, 5).join(', ')) + (samp.length >= 5 ? '…' : '') + ')' : '';
      return '<div>' + esc(code) + ': ' + esc(r.reasonCounts[code]) + s + (friendly ? ' — ' + esc(friendly) : '') + '</div>';
    }).join('');
    html += '</details>';
  }
  el.className = 'ro-ai-plan-result ro-ai-plan-result--' + tone;
  el.setAttribute('role', tone === 'bad' ? 'alert' : 'status');            // error → assertive; success/info/warn → polite status
  el.setAttribute('aria-live', tone === 'bad' ? 'assertive' : 'polite');
  el.innerHTML = html; el.hidden = false;
}

// --- the driver: START (once) → CONTINUE loop (one at a time) → DONE → getActive (once) → render ---------------
function _roAiPlanDelay_(fn, ms) { if (typeof setTimeout === 'function') setTimeout(fn, ms); else fn(); }
function _roRunAiPlanJob_(scope) {
  if (_roAiPlanBusy) return Promise.resolve(null);                                   // §3 never start a duplicate job
  var db = window.KM && window.KM.DB;
  if (!db || typeof db.startRequestOrderDraftJob !== 'function' || typeof db.continueRequestOrderDraftJob !== 'function') return Promise.resolve(null);
  if (!scope || !scope.company || !scope.country || !scope.marketplace) return Promise.resolve(null);   // scopeless → KMREC-only
  _roAiPlanBusy = true; _roAiPlanCancelRequested = false; _roAiPlanRunId = null; _roAiPlanTotal = 0;
  // F1-7N-FA-3C-R5D — this is the ONE explicit-manual entry (the AI Support click → scope modal → handleRequestOrderAiPlan).
  // Stamp a fresh manual token so ONLY this run may own the result popup, and clear any prior/stale result first.
  var ctx = { manual: true, token: (++_roAiPlanManualToken) };
  _roClearAiPlanResult_();   // F1-7N-FA-3C-PRE3-R2 — a new run replaces any prior terminal result
  _roAiPlanSetProgress_('AI Plan · Starting…', true);
  return Promise.resolve(db.startRequestOrderDraftJob(scope)).then(function (res) {
    var disp = _roAiPlanStartDisposition_(res);
    if (disp.action === 'FAIL') { _roAiPlanResetUi_(); _roNotify_(_roAiPlanFailMsg_(disp.code)); return null; }
    if (disp.action === 'BUSY') { _roAiPlanResetUi_(); _roNotify_(_roAiPlanFailMsg_(disp.code)); return null; }
    _roAiPlanRunId = disp.runId; _roAiPlanTotal = disp.total || 0;
    _roAiPlanSetProgress_('AI Plan · ' + (disp.total ? '0 / ' + disp.total : 'Generating…'), true);
    return _roAiPlanDriveContinue_(scope, ctx);
  }).catch(function () { _roAiPlanResetUi_(); return null; });
}
// ctx = { manual:boolean, token:number } — the RESULT AUTHORITY. Only a manual ctx whose token is still the newest
// manual token may open the popup/toast; a SYSTEM_RESUME/BACKGROUND ctx (manual:false) drives the job silently.
function _roAiPlanDriveContinue_(scope, ctx) {
  ctx = ctx || { manual: false, token: -1 };
  var db = window.KM && window.KM.DB;
  function step() {
    if (_roAiPlanCancelRequested) return;   // the cancel handler owns the terminal reload
    Promise.resolve(db.continueRequestOrderDraftJob(_roAiPlanRunId)).then(function (res) {
      if (_roAiPlanCancelRequested) return;
      var disp = _roAiPlanContinueDisposition_(res);
      var show = _roAiPlanShouldShowResult_(ctx);   // manual-only + newest-token → owns the result surface
      if (disp.action === 'BUSY') { _roAiPlanDelay_(step, _RO_AI_PLAN_BUSY_RETRY_MS); return; }   // §3 respect a live lease
      if (disp.action === 'MORE') { _roAiPlanSetProgress_('AI Plan · ' + disp.done + ' / ' + (_roAiPlanTotal || disp.total || 0), true); _roAiPlanDelay_(step, _RO_AI_PLAN_CONTINUE_DELAY_MS); return; }
      if (disp.action === 'DONE') { _roAiPlanFinishDone_(scope, disp, ctx); return; }
      if (disp.action === 'CANCELLED') { if (show) _roSetAiPlanResult_('CANCELLED', disp, scope); _roAiPlanFinishCancelled_(scope, show); return; }   // externally cancelled → announce ONLY for a manual owner
      if (disp.action === 'FAILED' || disp.action === 'FAIL') { if (show) { _roSetAiPlanResult_('FAILED', disp, scope); _roNotify_(_roAiPlanFailMsg_(disp.code)); } _roAiPlanResetUi_(); return; }   // §4 fail closed (silent for non-manual)
      if (show) _roSetAiPlanResult_('INCOMPLETE', disp, scope); _roAiPlanResetUi_();   // NONE / unknown → truthful result for a manual owner; silent otherwise
    }).catch(function () { _roAiPlanResetUi_(); if (_roAiPlanShouldShowResult_(ctx)) _roNotify_(_roAiPlanFailMsg_('AI_PLAN_CONTINUE_ERROR')); });
  }
  step();
}
// §6/§7/§17 — DONE: ONE scope getActive read-back → render Order Allocation from persisted drafts → ONE truthful toast
// that surfaces the real terminal counts (never a blanket success when 0 drafts were created — F1-7N-FA-3C-PRE3-R1).
function _roAiPlanFinishDone_(scope, disp, ctx) {
  _roAiPlanSetProgress_('AI Plan · Reading drafts…', true);
  var show = _roAiPlanShouldShowResult_(ctx);   // F1-7N-FA-3C-R5D — popup/toast ONLY for a manual, current-session run
  var msg = _roAiPlanDoneMsg_(disp && disp.counts);
  if (show) _roSetAiPlanResult_('DONE', disp, scope);   // manual only — durable popup (set BEFORE read-back so it survives the re-render)
  return Promise.resolve(_roLoadCanonicalDraftsForScope_(scope)).then(function () {
    _roAiPlanResetUi_(); if (show) { _roRenderAiPlanResult_(); _roNotify_(msg); }   // SYSTEM_RESUME/AUTOMATION → read-back only, no popup, no toast
  }).catch(function () { _roAiPlanResetUi_(); if (show) { _roRenderAiPlanResult_(); _roNotify_(msg); } });
}
// §18 — CANCELLED is NOT a failure: stop polling, reload the canonical drafts already created (preserved), notify once.
function _roAiPlanFinishCancelled_(scope, announce) {
  return Promise.resolve(_roLoadCanonicalDraftsForScope_(scope)).then(function () {
    _roAiPlanResetUi_(); if (announce !== false) _roNotify_('AI Plan cancelled — drafts already created were kept.');
  }).catch(function () { _roAiPlanResetUi_(); });
}
// §18/§5 — contextual Cancel: ONE backend cancel write for the active run; stop the poller; reload preserved drafts.
function handleCancelRequestOrderDraftJob() {
  if (!_roAiPlanBusy || _roAiPlanCancelRequested) return;
  _roAiPlanCancelRequested = true;
  var c = _roAiPlanCancelBtn_(); if (c) c.disabled = true;
  var db = window.KM && window.KM.DB;
  if (db && typeof db.cancelRequestOrderDraftJob === 'function') {
    return Promise.resolve(db.cancelRequestOrderDraftJob(_roAiPlanRunId)).then(function () {
      return _roAiPlanFinishCancelled_(_roCanonicalScope_(), true);
    }).catch(function () { _roAiPlanResetUi_(); });
  }
  _roAiPlanResetUi_();
}
// §16 — resume a still-RUNNING scope job on mount/reload rather than starting a duplicate. The single global job's
// status is read with a null runId; we adopt (drive + show progress) ONLY when it belongs to the current scope.
// If the backend cannot identify an owned running job for this scope, we do nothing (the getActive read-back already
// restores any existing drafts) — we never invent a job or add a second job table.
function _roResumeAiPlanJobOnMount_() {
  if (_roAiPlanBusy) return;
  var db = window.KM && window.KM.DB, scope = (typeof _roCanonicalScope_ === 'function') ? _roCanonicalScope_() : null;
  if (!db || typeof db.getRequestOrderDraftJobStatus !== 'function' || !scope) return;
  return Promise.resolve(db.getRequestOrderDraftJobStatus(null)).then(function (res) {
    if (!res || !res.success || _roAiPlanBusy) return;
    var d = res.data || {};
    if (d.status === 'RUNNING' && _roAiPlanScopeMatches_(d.scope, scope)) {
      _roAiPlanBusy = true; _roAiPlanCancelRequested = false; _roAiPlanRunId = d.runId || null; _roAiPlanTotal = d.total || 0;
      _roAiPlanSetProgress_('AI Plan · ' + ((d.cursor || 0) + ' / ' + (d.total || 0)), true);
      // F1-7N-FA-3C-R5D — a RESUMED job is NOT an explicit current-session user click: drive it silently (manual:false).
      // It never opens or restores the AI Plan Result popup/toast (a manual job re-adopted after reload also stays silent —
      // only a fresh in-session click owns the result). The getActive read-back still refreshes Order Allocation.
      _roAiPlanDriveContinue_(scope, { manual: false, token: -1 });
    }
  }).catch(function () {});
}
if (typeof window !== 'undefined') {
  window._roRunAiPlanJob_ = _roRunAiPlanJob_;
  window._roAiPlanStartDisposition_ = _roAiPlanStartDisposition_;
  window._roAiPlanContinueDisposition_ = _roAiPlanContinueDisposition_;
  window._roAiPlanFailMsg_ = _roAiPlanFailMsg_;
  window._roAiPlanScopeMatches_ = _roAiPlanScopeMatches_;
  window._roResumeAiPlanJobOnMount_ = _roResumeAiPlanJobOnMount_;
  window.handleCancelRequestOrderDraftJob = handleCancelRequestOrderDraftJob;
  window._roAiPlanShouldShowResult_ = _roAiPlanShouldShowResult_;   // F1-7N-FA-3C-R5D — manual-only result authority
  window._roAiPlanSeverity_ = _roAiPlanSeverity_;
  window._roAiPlanReasonLabel_ = _roAiPlanReasonLabel_;
  window._roSetAiPlanResult_ = _roSetAiPlanResult_;
  window._roRenderAiPlanResult_ = _roRenderAiPlanResult_;
}
