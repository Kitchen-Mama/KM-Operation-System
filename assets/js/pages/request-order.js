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
  return !!(window.KM && window.KM.DB && window.KM.DB.getDataSourceMode &&
    window.KM.DB.getDataSourceMode() === 'google-sheet' && window.KM.DB.getMarketplaceSkus);
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

function initRequestOrderSection() {
  // Data source priority: live DB (google-sheet) → Demo Data → empty. NEVER the Inventory DOM.
  if (_roUseDb()) {
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
  _roRenderAll();
}

function _roInitWithData() {
  requestOrderState.data = _buildRequestOrderRowsFromDb();
  _roRenderAll();
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
}

// Canonical marketplace key for a row: marketplace_id when present (live), else the display string (demo).
function _roMarketplaceKey(item) {
  return (item && item.marketplaceId != null && item.marketplaceId !== '') ? String(item.marketplaceId) : String(item.marketplace || '');
}
// Active marketplaces from the master (`marketplaces`). Blank/active/enabled statuses count as active.
function _roActiveMarketplaces() {
  var DB = (window.KM && window.KM.DB) || {};
  return ((DB.getMarketplaces && DB.getMarketplaces()) || []).filter(function(m) {
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

// Category tabs (Part 2) — built from distinct sku_details.category present in the data. "All" first.
// Uses the SHARED Category Tab Rail (.km-tab-rail / .km-tab-rail__tab + count badge) so the Order System
// matches Inventory Replenishment / Promotion Risk. Each tab shows Name + Count; counts reflect the
// current (other-filter) data set — selecting a Category never zeroes the other Category counts (they are
// computed from requestOrderState.data, not the post-category-filtered rows). Single-row horizontal scroll
// + active-into-view are handled by KM.ui.tabRail.
function _populateRequestOrderCategoryTabs() {
  var container = document.getElementById('ro-category-tabs');
  if (!container) return;
  var data = requestOrderState.data || [];
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
  renderRequestOrderTable();
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
      done: function () { _roShowCancel_(false); setBtn('Completed', true); if (typeof setTimeout === 'function') setTimeout(restore, 1500); else restore(); },
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
function runRoAiSupport(kind) {
    _roAiClose(false);
    if (kind === 'aiplan' && typeof handleRequestOrderAiPlan === 'function') return handleRequestOrderAiPlan();
    if (kind === 'recalcScope' && typeof recalcOrderPlanningGapCurrentScope === 'function') return recalcOrderPlanningGapCurrentScope();
    if (kind === 'recalcAll' && typeof handleRecalcAllOrderPlanningGap === 'function') return handleRecalcAllOrderPlanningGap();
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
  // 如果沒有數據，顯示提示訊息
  if (!requestOrderState.data || requestOrderState.data.length === 0) {
    const fixedBody = document.getElementById('ro-fixed-body');
    const scrollBody = document.getElementById('ro-scroll-body');

    if (fixedBody && scrollBody) {
      fixedBody.innerHTML = '';
      scrollBody.innerHTML = '<div class="ro-empty-state">No Request Order data available. Connect the Operation DB or enable Demo Data to view rows.</div>';
    }
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
  var allocRows = ['T1', 'T2', 'T3'].map(function (t, i) {
    var mo = next3[i];
    var sug = _roTierSuggested(item, i);
    if (sug != null) anySuggested = true;
    var e = edits[t] || {};
    var eff = _roEffectiveOrderQty(item, i, e);   // Order Qty default UNCHANGED (frozen write path; §18)
    var cb = _roCartonBreak(eff == null ? '' : eff, box);
    var note = e.note != null ? String(e.note).replace(/"/g, '&quot;') : '';
    var qtyVal = (eff == null) ? '' : eff;
    // FM3d: Suggested column ← canonical monthlyProjection.suggestedOrderQty when the workspace is ON (server
    // KMCALC carton owner; NO page-side carton math). Legacy page-Suggested only on the workspace-OFF fallback.
    var sugCell = recoOn
      ? '<td data-ro-suggested-tier="' + t + '">' + _opRecoFmtQty((_roCanonTier(t) ? _roCanonTier(t).suggestedOrderQty : null), recoLoading) + '</td>'
      : '<td>' + (sug == null ? '--' : sug.toLocaleString()) + '</td>';
    return '<tr><td>' + t + ' · ' + mo.label + '</td>' +
      sugCell +
      '<td><input type="number" min="0" step="1" class="ro-alloc-qty" value="' + qtyVal + '" ' +
        'data-sku="' + _roAttr(sku) + '" data-country="' + _roAttr(country) + '" data-marketplace="' + _roAttr(marketplace) + '" ' +
        'data-bucket="' + t + '" data-idx="' + i + '" data-box="' + box + '" data-month="' + _roYm(mo) + '" onchange="_roAllocEdit(this)" oninput="_roRecomputeAllocRow(this)"></td>' +
      '<td class="ro-carton-cell" data-cell="carton">' + _roCartonCellHtml(cb, box) + '</td>' +
      '<td><input type="text" class="ro-alloc-note" value="' + note + '" ' +
        'data-sku="' + _roAttr(sku) + '" data-country="' + _roAttr(country) + '" ' +
        'data-marketplace="' + _roAttr(marketplace) + '" data-bucket="' + t + '" onchange="_roAllocEditNote(this)"></td></tr>';
  }).join('');
  var firstShortBadge = (firstShort != null)
    ? '<span class="ro-first-shortage-badge">First Shortage: ' + RO_TIER_LABELS[firstShort] + ' · ' + next3[firstShort].label + '</span>'
    : '';
  // F1-4B-FM2B: when the canonical Recommendation Runtime is the active READ path, the "Recommendation —
  // Order Need" subsection below OWNS the recommendation surface — so the generic legacy "No recommendation
  // available." message is suppressed (it must never show alongside canonical lines). When the workspace is
  // OFF (kill switch), the legacy tier Suggested behavior is preserved verbatim.
  var allocEmpty = (anySuggested || _opRecoEnabled()) ? '' : '<div class="ro-rec-empty">No recommendation available.</div>';

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
function _roAllocEditNote(input) {
  var key = (input.dataset.sku || '') + '|' + (input.dataset.country || '') + '|' + (input.dataset.marketplace || '');
  var bucket = input.dataset.bucket;
  var rec = _roAllocEnsure(key);
  if (!rec[bucket]) rec[bucket] = {};
  rec[bucket].note = String(input.value || '');
}

function toggleRequestOrderSkuExpand(sku, country, marketplace, company) {
  _roToggleRowByKey(_roRowKey({ sku: sku, country: country, marketplace: marketplace, company: company }));
}

// Toggle a row's second layer by its composite row key, then re-sync the expand-panel heights.
function _roToggleRowByKey(rowKey) {
  if (rowKey == null) return;
  requestOrderState.expandedRowKey = (requestOrderState.expandedRowKey === rowKey) ? null : rowKey;
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

// Re-read the fresh cache (adapter force-reloads it before its write promise resolves) and re-render the
// table, keeping the currently expanded row open.
function _roReloadAndRerender() {
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
function _roBindEditModal(saveFn) {
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
      _roReloadAndRerender();
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
  _roBindEditModal(function() { return _roSaveTargetPct(item, _roCollectEditInputs('ro-tgt-new-', next3)); });
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
  _roBindEditModal(function() { return _roSaveFc(item, _roCollectEditInputs('ro-fc-new-', next3)); });
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

function _roUpdateConfirmStatus() {
  var el = document.getElementById('ro-confirm-status');
  if (!el) return;
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
async function handleSendRequest() {
  const requestType = document.getElementById('ro-request-type').value;
  const buckets = _roBucketsForType(requestType);
  const typeLabel = { all: 'All Request (T1+T2+T3)', t1: 'T1 Request', t2: 'T2 Request', t3: 'T3 Request' }[requestType];

  // Gate 1: at least one confirmed site must exist, and every required site scope must be confirmed for
  // ALL requested buckets (Send T1/T2/T3 → that bucket; All → T1+T2+T3). Confirm Site ≠ Send Request.
  if (!(requestOrderState.confirmedSites || []).some(function(c) { return c.status === 'confirmed'; })) {
    alert('Please confirm all site scopes before sending this request.');
    return;
  }
  const pendingSites = _roUnconfirmedSites(buckets);
  if (pendingSites.length) {
    alert('Please confirm all site scopes before sending this request.\n\nPending (' + buckets.join('+') + '): ' + pendingSites.join(', '));
    return;
  }

  // Collect eligible allocation lines from the confirmed, filtered rows (only order_qty > 0).
  // Each line carries its bucket/month + the same source snapshots used by the 下單系統 table.
  const rows = _applyRequestOrderFilters(requestOrderState.data).filter(_roIsRowConfirmed);
  const drafts = [];        // { item, lines: [{ bucket, month, orderQty, note, upc, carton, looseUnits, isPartial, ... }] }
  let partialCount = 0;     // manual partial-carton lines (allowed — recorded, never blocked)
  rows.forEach(function(item) {
    const edits = requestOrderState.allocEdits[_roAllocKey(item)] || {};
    const upc = parseFloat(item.boxSize) || 0;
    const lines = [];
    buckets.forEach(function(b) {
      const idx = RO_TIER_LABELS.indexOf(b);
      const e = edits[b] || {};
      const eff = _roEffectiveOrderQty(item, idx, e);   // explicit user edit, else default Suggested Qty
      const q = (eff == null) ? 0 : Number(eff);
      if (isNaN(q) || q <= 0) return;                    // none / invalid → skip (negatives blocked at input)
      const cb = _roCartonBreak(q, upc);
      const sug = _roTierSuggested(item, idx);
      const diff = (sug == null) ? '' : (q - sug);
      const partial = !!(cb.isValid && cb.isPartial);    // NON-blocking manual partial carton
      if (partial) partialCount++;
      const mo = _roBucketMonthObj(b);
      const moYm = mo ? (mo.year + '-' + String(mo.idx + 1).padStart(2, '0')) : '';
      const fcQty = _roFcForItemMonth(item, mo);
      lines.push({
        bucket: b, month: e.month || moYm, orderQty: q, note: e.note || '',
        upc: upc,
        carton: (upc > 0) ? (cb.full != null ? cb.full : Math.floor(q / upc)) : '',   // FULL cartons only
        looseUnits: (upc > 0 && cb.loose != null) ? cb.loose : '',                     // remainder units (partial)
        isPartial: partial,
        suggestedQty: (sug == null ? '' : sug),
        orderVsSuggested: diff,                                                        // Order − Suggested (audit)
        fcQty: (fcQty == null ? '' : fcQty),
        targetPct: mo ? _roTargetPct(item, mo) : '',
        siteStock: (item.siteStock == null ? '' : item.siteStock),
        thirdPartyStock: (item.thirdPartyStock == null ? '' : item.thirdPartyStock),
        factoryStock: (item.factoryStock == null ? '' : item.factoryStock)
      });
    });
    if (lines.length) drafts.push({ item: item, lines: lines });
  });

  // NOTE: partial cartons are ALLOWED (non-blocking). They are recorded (full cartons + loose units +
  // Order−Suggested diff) but never rounded back to a full carton (task H). No full-carton Gate here.

  if (!drafts.length) {
    alert('No positive Order Qty in ' + typeLabel + '.\n\nOpen a confirmed SKU’s Order Allocation and enter Order Qty (T1/T2/T3) first.');
    return;
  }

  const totalUnits = drafts.reduce(function(s, d) { return s + d.lines.reduce(function(a, l) { return a + l.orderQty; }, 0); }, 0);
  let msg = 'Send Request — ' + typeLabel + '\n\nSKU rows: ' + drafts.length + '\nTotal units: ' + totalUnits.toLocaleString() +
    (partialCount ? ('\nPartial-carton lines: ' + partialCount + ' (allowed — recorded with loose units)') : '') +
    '\n\nGrouped into Request Order Draft(s) by Series (supplier/factory pending).\n\nProceed?';
  if (!confirm(msg)) return;

  // Group lines by Series → one Request Order Draft per series (supplier/factory pending).
  const bySeries = {};
  drafts.forEach(function(d) {
    const series = d.item.series || '';
    const key = series || '(no series)';
    if (!bySeries[key]) bySeries[key] = [];
    d.lines.forEach(function(l) {
      bySeries[key].push({
        sku: d.item.sku, series: series, company: d.item.company || '', requested_qty: l.orderQty,
        request_bucket: l.bucket, request_month: l.month,           // bucket PRESERVED per line (never merged)
        // country/marketplace flow into request_order_line_sources (source of truth for site allocation).
        country: d.item.country || '', marketplace: d.item.marketplace || '',
        units_per_carton: l.upc || '',
        calculation_method: l.isPartial ? 'manual_partial_carton' : 'manual_order_allocation', line_status: 'draft',
        note: (d.item.company || '--') + ' / ' + (d.item.country || '--') + ' / ' + (d.item.marketplace || '--') +
              ' · ' + l.bucket + ' ' + (l.month || '') +
              (l.isPartial ? (' · PARTIAL CARTON (' + (l.carton || 0) + ' ctn + ' + (l.looseUnits || 0) + ' loose)') : '') +
              (l.suggestedQty !== '' && l.orderVsSuggested !== '' && l.orderVsSuggested !== 0 ? (' · Order−Suggested=' + l.orderVsSuggested + ' (suggested ' + l.suggestedQty + ')') : '') +
              (l.note ? (' — ' + l.note) : '')
      });
    });
  });

  // Demo mode: no DB — simulate + log.
  if (!_roUseDb()) {
    console.log('=== Send Request (DEMO, in-memory only) ===', { typeLabel: typeLabel, drafts: drafts, bySeries: bySeries });
    alert('DEMO (in-memory only, NOT written to DB)\n\n' + typeLabel + '\nSKU rows: ' + drafts.length +
      '\nSeries groups: ' + Object.keys(bySeries).length + '\nTotal units: ' + totalUnits.toLocaleString() +
      '\n\nLive mode would create Request Order Draft(s) + persist allocation drafts.');
    return;
  }

  // Live: (1) persist allocation drafts + lines, (2) create request orders per series, (3) submit drafts.
  const DB = window.KM.DB;
  try {
    const cycle = String(new Date().getFullYear());
    const draftIds = [];
    for (var di = 0; di < drafts.length; di++) {
      const d = drafts[di];
      const hdr = await DB.upsertRequestOrderAllocationDraft({
        // CANONICAL fields (2026-07-27 DB sync): category_snapshot/series_snapshot capture the Master SKU
        // values at creation; generation_type replaces the retired source_type. The manual Send Request
        // flow is always user_created / regular / draft_version 1.
        planning_cycle: cycle, company: d.item.company || '', country: d.item.country || '',
        marketplace: d.item.marketplace || '', sku: d.item.sku,
        category_snapshot: d.item.category || '', series_snapshot: d.item.series || '',
        status: 'site_confirmed', generation_type: 'user_created', draft_purpose: 'regular',
        draft_version: 1, created_by: 'request-order'
      });
      const draftId = hdr && (hdr.request_allocation_draft_id || hdr.requestAllocationDraftId);
      if (draftId) {
        draftIds.push(draftId);
        await DB.upsertRequestOrderAllocationDraftLines({
          request_allocation_draft_id: draftId,
          lines: d.lines.map(function(l) {
            return {
              // CANONICAL snapshot field names (2026-07-27 DB sync). order_qty = user input; no
              // recommended_qty is sent (Engine B not implemented) so the system snapshot stays blank.
              request_month: l.month, request_bucket: l.bucket, order_qty: l.orderQty,
              carton_qty: l.carton, units_per_carton: l.upc,
              factory_available_qty_snapshot: l.factoryStock, destination_stock_snapshot: l.siteStock,
              third_party_available_qty_snapshot: l.thirdPartyStock, regular_demand_snapshot: l.fcQty,
              target_pct_snapshot: l.targetPct,
              // Persistence boundary: no dedicated partial/override column exists → partial full/loose +
              // Order−Suggested diff are carried in `note` (audit) + allocation_method. No schema change.
              note: (l.isPartial ? ('[PARTIAL ' + (l.carton || 0) + 'ctn+' + (l.looseUnits || 0) + 'loose; suggested ' + l.suggestedQty + '; diff ' + l.orderVsSuggested + '] ') : '') + (l.note || ''),
              allocation_method: l.isPartial ? 'manual_partial_carton' : 'manual'
            };
          })
        });
      }
    }

    const createdNos = [];
    const seriesKeys = Object.keys(bySeries);
    for (var si = 0; si < seriesKeys.length; si++) {
      const series = seriesKeys[si];
      const res = await DB.createRequestOrderDraft({
        company: '', source: 'manual', source_ref_type: 'request_order_allocation',
        note: 'Send Request — series ' + series + ' (supplier/factory pending)',
        lines: bySeries[series]
      });
      if (res && (res.request_order_no || res.requestOrderNo)) createdNos.push(res.request_order_no || res.requestOrderNo);
    }

    if (draftIds.length) await DB.submitRequestOrderAllocationDrafts({ draft_ids: draftIds, submitted_by: 'request-order' });

    alert('✅ Send Request 完成\n\n' + typeLabel + '\n建立 Request Order Draft: ' + createdNos.length + ' 筆' +
      (createdNos.length ? ('\n' + createdNos.join(', ')) : '') +
      '\n\n請到 Request Order Draft 頁面進行 Approve / Convert to PO。');
    renderRequestOrderTable();
  } catch (err) {
    alert('Send Request 失敗：' + (err && err.message ? err.message : err) + '\n\n（未完成的寫入請重試；已建立的 Draft 仍保留。）');
  }
}

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
function handleRequestOrderAiPlan() {
  var btn = document.getElementById('ro-ai-plan-btn');
  if (btn && btn.disabled) return;
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
        mount() {
            console.log('[RequestOrder] mount');
            // Markup is partial-loaded (Phase 3-5). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open) and init.
            _ensureRequestOrderMarkup().then(function() {
                var sec = document.getElementById('request-order-section');
                if (sec) sec.classList.add('active');
                if (window.initRequestOrderSection) {
                    window.initRequestOrderSection();
                }
                // F1-4B-FM5-R4J §13 — resume a still-running backend Order Planning gap job on mount/reload.
                if (typeof _roResumeGapJobOnMount_ === 'function') { try { _roResumeGapJobOnMount_(); } catch (e) {} }
            });
        },
        unmount() {
            console.log('[RequestOrder] unmount');
        }
    });
}
