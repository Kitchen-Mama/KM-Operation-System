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
// Next N calendar months after the current month → [{ key, year, idx, label }]. Handles year wrap.
function _roNextMonths(n) {
  var d = new Date();
  var y = d.getFullYear(), m = d.getMonth(); // 0-based current month
  var out = [];
  for (var i = 1; i <= n; i++) {
    var mm = m + i;
    var yy = y + Math.floor(mm / 12);
    var idx = ((mm % 12) + 12) % 12;
    out.push({ key: RO_MONTH_KEYS[idx], year: yy, idx: idx, label: (idx + 1) + '/' + yy });
  }
  return out;
}
// Past N calendar months before (and including offset) the current month → [{ key, year, idx, label }].
function _roPastMonths(n) {
  var d = new Date();
  var y = d.getFullYear(), m = d.getMonth();
  var out = [];
  for (var i = n; i >= 1; i--) {
    var mm = m - i;
    var yy = y + Math.floor(mm / 12);
    var idx = ((mm % 12) + 12) % 12;
    out.push({ key: RO_MONTH_KEYS[idx], year: yy, idx: idx, label: (idx + 1) + '/' + yy });
  }
  return out;
}
function _roUpper(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function _roLower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
// Composite row identity — sku + company + country + marketplace (company may be '' → still unique per
// site). Fixes the SKU-only expand bug where same-SKU rows on different sites expanded together.
function _roRowKey(item) {
  return [item.sku || '', item.company != null ? item.company : '', item.country || '', item.marketplace || ''].join('|');
}
// Escape a value for embedding inside a single-quoted JS string in an inline onclick handler.
function _roJs(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function _roIsActiveFlag(v) { var s = _roLower(v); return s === 'active' || s === 'true' || s === 'yes' || s === '1'; }

// Open PO statuses that still contribute to Ongoing Orders (Part 5). Excludes draft / completed /
// closure / cancelled / (fully) shipped. `confirmed` / `ready_to_ship` are legacy-open.
var RO_OPEN_PO_STATUS = { issued: 1, in_production: 1, partial_completed: 1, partial_shipped: 1, ready_to_ship: 1, confirmed: 1 };

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
      if (r.country && country && _roUpper(r.country) !== _roUpper(country)) return;
      if (r.marketplace && marketplace && _roLower(r.marketplace) !== _roLower(marketplace)) return;
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
        if (country && wh.country && _roUpper(wh.country) !== _roUpper(country)) return;
        var isFactory = _roLower((wh.raw && wh.raw.is_factory_warehouse) || '');
        if (isFactory === 'true' || isFactory === '1' || isFactory === 'yes') return;
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
      category: d.category || '',
      series: d.series || '',
      company: m.company || '',
      // --- Mapped from real DB sources (null → "--" when the source is missing) ---
      basicFcT3: basicT3(m.sku, m.country, m.marketplace),          // fc_regular_forecast next 3 months
      specialEventsFc: null,                                        // fc_special_events (2nd-layer only for v2)
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
  syncRequestOrderScroll();
  initRequestOrderDropdowns();
  _roUpdateConfirmStatus();
}

// Rebuild Country / Marketplace dropdown options from the live data (distinct values). When there
// is no data the existing (demo) options are left untouched. Risk options stay static (placeholder).
function _populateRequestOrderFilterOptions() {
  if (!(requestOrderState.data && requestOrderState.data.length)) return;
  _roRebuildDropdown('country', _roDistinct(requestOrderState.data.map(function(i) { return i.country; })));
  _roRebuildDropdown('marketplace', _roDistinct(requestOrderState.data.map(function(i) { return i.marketplace; })));
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
function _populateRequestOrderCategoryTabs() {
  var container = document.getElementById('ro-category-tabs');
  if (!container) return;
  var cats = _roDistinct((requestOrderState.data || []).map(function(i) { return i.category; }));
  var active = requestOrderState.categoryTab || 'All';
  if (active !== 'All' && cats.indexOf(active) === -1) { active = 'All'; requestOrderState.categoryTab = 'All'; }
  var tabs = ['All'].concat(cats);
  container.innerHTML = tabs.map(function(c) {
    var cls = 'ro-tab' + (c === active ? ' ro-tab--active' : '');
    return '<button class="' + cls + '" data-category="' + _roEsc(c) + '" onclick="setRequestOrderCategory(this.getAttribute(\'data-category\'), this)">' + _roEsc(c) + '</button>';
  }).join('');
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

  requestOrderState.page = 1;   // filter change → back to page 1 (Part 1)
  renderRequestOrderTable();
}

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
    
    // 計算本月日均 FC
    const fcThisMonthDaily = fcThisMonth / daysInCurrentMonth;
    
    // Campaign FC（未來可從 Event FC 抓取）
    const campaignNextMonth = seededRandom(seed + 11) > 0.6 ? rand(100, 300, 11) : 0;
    const campaignMonth2 = seededRandom(seed + 12) > 0.7 ? rand(150, 400, 12) : 0;
    const campaignMonth3 = seededRandom(seed + 13) > 0.8 ? rand(200, 500, 13) : 0;
    
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
          campaignNextMonth,
          campaignMonth2,
          campaignMonth3,
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

// Category tab click (Part 2) — sets the active Category tab and re-renders (page → 1).
function setRequestOrderCategory(cat, btn) {
  requestOrderState.categoryTab = cat || 'All';
  requestOrderState.page = 1;
  const container = document.getElementById('ro-category-tabs');
  if (container) container.querySelectorAll('.ro-tab').forEach(t => t.classList.remove('ro-tab--active'));
  if (btn && btn.classList) btn.classList.add('ro-tab--active');
  renderRequestOrderTable();
}

// Search button (Part 1) — reads the SKU keyword input and re-renders (keyword contains-match; page → 1).
function handleRequestOrderSearch() {
  const input = document.querySelector('.ro-filter-sku');
  requestOrderState.filters.sku = input ? String(input.value || '').trim() : '';
  requestOrderState.page = 1;
  renderRequestOrderTable();
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

  const cf = f.country || [], mf = f.marketplace || [];
  if (cf.length || mf.length) {
    out = out.filter(item => {
      const cMatch = cf.length > 0 && cf.includes(item.country);
      const mMatch = mf.length > 0 && mf.includes(item.marketplace);
      return cMatch || mMatch;   // OR — never AND
    });
  }

  const rf = f.risk || [];
  if (rf.length > 0) {
    out = out.filter(item => rf.includes(item.risk));
  }

  if (f.sku) {
    const kw = f.sku.toLowerCase();
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
    return `
    <div class="ro-fixed-wrapper" data-rowkey="${_roEsc(rowKey)}">
      <div class="fixed-row ${isExpanded ? 'is-expanded' : ''}" data-rowkey="${_roEsc(rowKey)}">
        <span class="ro-sku-expand-toggle ${isExpanded ? 'is-expanded' : ''}"
              onclick="${toggleCall}">
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
    let suggestDisplay = '--';
    if (!isPh) {
      const t1Order = item.shortageM1 < 0 ? Math.ceil(Math.abs(item.shortageM1) / item.boxSize) * item.boxSize : 0;
      const t2Order = item.shortageM2 < 0 ? Math.ceil(Math.abs(item.shortageM2) / item.boxSize) * item.boxSize : 0;
      const t3Order = item.shortageM3 < 0 ? Math.ceil(Math.abs(item.shortageM3) / item.boxSize) * item.boxSize : 0;
      const totalSuggestedOrder = t1Order + t2Order + t3Order;
      suggestDisplay = totalSuggestedOrder > 0 ? totalSuggestedOrder.toLocaleString() : '0';
    }

    const riskVal = item.risk == null ? '' : item.risk;
    const rowKey = _roRowKey(item);
    const isExpanded = requestOrderState.expandedRowKey === rowKey;
    const toggleCall = `toggleRequestOrderSkuExpand('${_roJs(item.sku)}','${_roJs(item.country)}','${_roJs(item.marketplace)}','${_roJs(item.company)}')`;

    return `
      <div class="ro-row-wrapper" data-rowkey="${_roEsc(rowKey)}">
        <div class="scroll-row">
          <!-- Risk 欄位 (placeholder until risk engine) -->
          <div class="scroll-cell scroll-cell--risk" data-risk="${riskVal}">${_roFmt(item.risk)}</div>
          <!-- Country 欄位 -->
          <div class="scroll-cell scroll-cell--country">${_roFmt(item.country)}</div>
          <!-- Marketplace 欄位 -->
          <div class="scroll-cell scroll-cell--marketplace">${_roFmt(item.marketplace)}</div>
          <!-- Upcoming FC 欄位 (2個) -->
          <div class="scroll-cell">${_roFmt(item.basicFcT3)}</div>
          <div class="scroll-cell">${item.specialEventsFc == null ? '--' : (item.specialEventsFc > 0 ? item.specialEventsFc.toLocaleString() : '-')}</div>
          <!-- Inventory & Ongoing 欄位 (4個) — Site Stock 與 3rd Party 永遠分開顯示 -->
          <div class="scroll-cell">${_roFmt(item.siteStock)}</div>
          <div class="scroll-cell">${_roFmt(item.thirdPartyStock)}</div>
          <div class="scroll-cell">${_roFmt(item.factoryStock)}</div>
          <div class="scroll-cell">${_roFmt(item.totalOngoingOrders)}</div>
          <!-- Coverage & Time 欄位 (2個): Remaining (placeholder) / Lead Time (supplier_price_list) -->
          <div class="scroll-cell">${_roFmt(item.remaining)}</div>
          <div class="scroll-cell">${_roFmt(item.leadTime)}</div>
          <!-- Shortage 欄位 (3個) - 隱藏但保有篩選功能 -->
          <div class="scroll-cell" style="display:none;">${item.shortageM1 < 0 ? Math.abs(item.shortageM1).toFixed(0) : '0'}</div>
          <div class="scroll-cell" style="display:none;">${item.shortageM2 < 0 ? Math.abs(item.shortageM2).toFixed(0) : '0'}</div>
          <div class="scroll-cell" style="display:none;">${item.shortageM3 < 0 ? Math.abs(item.shortageM3).toFixed(0) : '0'}</div>
          <!-- Decision 欄位 (1個): Suggest Order (calc placeholder) -->
          <div class="scroll-cell ro-request-order-cell">
            <span class="ro-request-order-value">${suggestDisplay}</span>
            <span class="ro-request-order-icon" onclick="${toggleCall}" title="Edit details">⚙</span>
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

  // fc_special_events for this SKU (best-effort scope + country/marketplace match).
  var evRows = ((DB.getFcSpecialEvents && DB.getFcSpecialEvents()) || []).filter(function(e) {
    var skuMatch = _roUpper(e.sku) === _roUpper(sku) || (e.scopeType === 'sku' && _roUpper(e.scopeId) === _roUpper(sku));
    if (!skuMatch) return false;
    if (e.country && country && _roUpper(e.country) !== _roUpper(country)) return false;
    if (e.marketplace && marketplace && _roLower(e.marketplace) !== _roLower(marketplace)) return false;
    return true;
  });
  function eventMonthIdx(e) {
    var s = _roLower(e.eventMonth);
    if (!s) return null;
    var mIdx = RO_MONTH_KEYS.indexOf(s.slice(0, 3));
    if (mIdx !== -1) return mIdx;
    var m = s.match(/(\d{4})[-/](\d{1,2})/); if (m) return parseInt(m[2], 10) - 1;
    var n = parseInt(s, 10); if (!isNaN(n) && n >= 1 && n <= 12) return n - 1;
    return null;
  }
  function eventsForMonth(mo) {
    var total = 0, any = false;
    evRows.forEach(function(e) { if (eventMonthIdx(e) === mo.idx) { total += (e.fcQty || 0); any = true; } });
    return any ? total : null;
  }

  var past3 = _roPastMonths(3);
  var next3 = _roNextMonths(3);
  var next2 = _roNextMonths(2);
  var next4 = _roNextMonths(4);

  // Block 1 — Past Achievement (FC Qty real when available; Actual/Sessions/USP/Rate not sourced → "--").
  var p1Rows = past3.map(function(mo) {
    return '<tr><td>' + mo.label + '</td><td>--</td><td>' + _roFmt(fcForMonth(mo)) + '</td><td>--</td><td>--</td><td>--</td></tr>';
  }).join('');

  // Block 2 — Future Basic / Special FC. Basic FC gains a Target % column (fc_target_rules → % else 100%).
  var basicRows = next3.map(function(mo) {
    return '<tr><td>' + mo.label + '</td><td>' + _roFmt(fcForMonth(mo)) + '</td><td>' + _roTargetPct(item, mo) + '%</td></tr>';
  }).join('');
  var eventRows = next3.map(function(mo) { return '<tr><td>' + mo.label + '</td><td>' + _roFmt(eventsForMonth(mo)) + '</td></tr>'; }).join('');

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

  // Block 3b — Factory Orders (Future 2 Months) — no reliable per-month source yet → placeholder.
  var factoryOrderRows = next2.map(function(mo) { return '<tr><td>' + mo.label + '</td><td>--</td><td>--</td></tr>'; }).join('');

  // Block 4a — Recommendation Summary (future 4 months; structure only, NO formula).
  var recRows = next4.map(function(mo) { return '<tr><td>' + mo.label + '</td><td>--</td><td>--</td></tr>'; }).join('');

  // Block 4b — Order Allocation (T1/T2/T3). Order Qty editable → local state (persisted on Send Request).
  function _roYm(mo) { return mo.year + '-' + String(mo.idx + 1).padStart(2, '0'); }
  var buckets = [{ b: 'T1', mo: next3[0] }, { b: 'T2', mo: next3[1] }, { b: 'T3', mo: next3[2] }];
  var edits = requestOrderState.allocEdits[_roAllocKey(item)] || {};
  var allocRows = buckets.map(function(x) {
    var e = edits[x.b] || {};
    var qty = (e.orderQty != null) ? e.orderQty : 0;
    var note = e.note != null ? String(e.note).replace(/"/g, '&quot;') : '';
    return '<tr><td>' + x.mo.label + '</td><td>' + x.b + '</td><td>--</td>' +
      '<td><input type="number" min="0" class="ro-alloc-qty" value="' + qty + '" ' +
        'data-sku="' + _roAttr(sku) + '" data-country="' + _roAttr(country) + '" data-marketplace="' + _roAttr(marketplace) + '" ' +
        'data-bucket="' + x.b + '" data-month="' + _roYm(x.mo) + '" onchange="_roAllocEdit(this)"></td>' +
      '<td>--</td>' +
      '<td><input type="text" class="ro-alloc-note" value="' + note + '" ' +
        'data-sku="' + _roAttr(sku) + '" data-country="' + _roAttr(country) + '" data-marketplace="' + _roAttr(marketplace) + '" ' +
        'data-bucket="' + x.b + '" onchange="_roAllocEditNote(this)"></td></tr>';
  }).join('');

  // Second-layer v5 — a true 3-column × 2-row grid. Each block is its OWN card (independent spacing;
  // Factory Stock ≠ Factory Orders card; Recommendation ≠ Order Allocation card). Cards are direct grid
  // children so each grid ROW auto-stretches to equal height → top row (Past Achievement / Factory Stock
  // / Recommendation) aligns and bottom row (Future FC / Factory Orders / Order Allocation) aligns.
  // Column A (34%) = Achievement / FC · Column B (24%) = Factory · Column C (42%) = Decision.
  // DOM order is column-major (A1,A2,B1,B2,C1,C2) so on small screens columns stack grouped & clean.
  return `
    <div class="ro-sku-expand-panel is-open" data-rowkey="${_roEsc(_roRowKey(item))}">
      <div class="ro-sku-expand-grid ro-sku-expand-grid--v5">
        <!-- Column A · row 1 -->
        <div class="ro-sku-expand-card ro-expand-card--compact ro-v5-a1">
          <div class="ro-expand-card-title">Past Achievement Rate (Past 3 Months)</div>
          <table class="ro-expand-table"><thead><tr><th>Month</th><th>Achv %</th><th>FC Qty</th><th>Actual</th><th>Sessions</th><th>USP</th></tr></thead><tbody>${p1Rows}</tbody></table>
        </div>
        <!-- Column A · row 2 -->
        <div class="ro-sku-expand-card ro-expand-card--compact ro-v5-a2">
          <div class="ro-expand-card-title">Future Basic / Special FC</div>
          <div class="ro-expand-fc-split">
            <div class="ro-expand-fc-col">
              <div class="ro-expand-subtitle">Basic FC</div>
              <table class="ro-expand-table"><thead><tr><th>Month</th><th>FC Qty</th><th>Target %</th></tr></thead><tbody>${basicRows}</tbody></table>
            </div>
            <div class="ro-expand-fc-col">
              <div class="ro-expand-subtitle">Upcoming Events</div>
              <table class="ro-expand-table"><thead><tr><th>Month</th><th>FC Qty</th></tr></thead><tbody>${eventRows}</tbody></table>
            </div>
          </div>
        </div>

        <!-- Column B · row 1 -->
        <div class="ro-sku-expand-card ro-v5-b1">
          <div class="ro-expand-card-title">Factory Stock</div>
          <table class="ro-expand-table"><thead><tr><th>Factory</th><th>Current Stock</th><th>Reserved</th><th>Available</th></tr></thead><tbody>${factoryStockRows}</tbody></table>
        </div>
        <!-- Column B · row 2 -->
        <div class="ro-sku-expand-card ro-v5-b2">
          <div class="ro-expand-card-title">Factory Orders (Future 2 Months)</div>
          <table class="ro-expand-table"><thead><tr><th>Month</th><th>Qty</th><th>Expected Delivery Date</th></tr></thead><tbody>${factoryOrderRows}</tbody></table>
        </div>

        <!-- Column C (Decision) · row 1 -->
        <div class="ro-sku-expand-card ro-v5-c1">
          <div class="ro-expand-card-title">Recommendation Summary</div>
          <table class="ro-expand-table"><thead><tr><th>Month</th><th>Recommended Qty</th><th>Reason</th></tr></thead><tbody>${recRows}</tbody></table>
        </div>
        <!-- Column C (Decision) · row 2 -->
        <div class="ro-sku-expand-card ro-v5-c2">
          <div class="ro-expand-card-title">Order Allocation</div>
          <table class="ro-expand-table"><thead><tr><th>Month</th><th>Bucket</th><th>Suggested</th><th>Order Qty</th><th>Carton</th><th>Note</th></tr></thead><tbody>${allocRows}</tbody></table>
          <div class="ro-expand-note">Suggested/Recommended are placeholders — no formula yet. Order Qty is editable and saved on Send Request.</div>
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
  var q = parseInt(input.value, 10);
  rec[bucket].orderQty = isNaN(q) || q < 0 ? 0 : q;
  rec[bucket].month = input.dataset.month || '';
}
function _roAllocEditNote(input) {
  var key = (input.dataset.sku || '') + '|' + (input.dataset.country || '') + '|' + (input.dataset.marketplace || '');
  var bucket = input.dataset.bucket;
  var rec = _roAllocEnsure(key);
  if (!rec[bucket]) rec[bucket] = {};
  rec[bucket].note = String(input.value || '');
}

function toggleRequestOrderSkuExpand(sku, country, marketplace, company) {
  var key = _roRowKey({ sku: sku, country: country, marketplace: marketplace, company: company });
  requestOrderState.expandedRowKey = (requestOrderState.expandedRowKey === key) ? null : key;
  renderRequestOrderTable();
  
  // Sync heights after render with multiple attempts
  requestAnimationFrame(() => {
    syncExpandPanelHeights();
    // Double check after a short delay
    setTimeout(() => {
      syncExpandPanelHeights();
    }, 100);
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

// ---- Second-layer modals (Part 9). READ-ONLY in v1: they load current DB values but DO NOT save,
// because no write handler exists yet (updateFcTargetRule / updateFcRegularForecast are future). ----
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

// Edit Target % — loads the current fc_target_rules target for SKU+country+marketplace (read-only).
// Future write target: fc_target_rules (no handler yet → read-only + notice).
function handleEditTargetPct(sku, country, marketplace) {
  var DB = (window.KM && window.KM.DB) || {};
  var rules = (DB.getFcTargetRules && DB.getFcTargetRules()) || [];
  var match = rules.filter(function(r) {
    return (r.scopeType === 'sku' && _roUpper(r.scopeId) === _roUpper(sku)) &&
      (!r.country || !country || _roUpper(r.country) === _roUpper(country)) &&
      (!r.marketplace || !marketplace || _roLower(r.marketplace) === _roLower(marketplace));
  })[0];
  var cur = (match && match.targetPercentage != null) ? (match.targetPercentage + '%') : '--';
  var body =
    '<div class="ro-modal-row"><span>SKU</span><strong>' + _roEsc(sku) + '</strong></div>' +
    '<div class="ro-modal-row"><span>Country / Marketplace</span><strong>' + _roEsc(country || '--') + ' / ' + _roEsc(marketplace || '--') + '</strong></div>' +
    '<div class="ro-modal-row"><span>Current Target %</span><strong>' + _roEsc(cur) + '</strong></div>' +
    '<p class="ro-modal-note">Source / future write target: <code>fc_target_rules</code>. Read-only in v1 — no save handler yet.</p>';
  _roOpenModal('Edit Target %', body);
}

// FC Update — loads the current fc_regular_forecast (next 3 months) for SKU+country+marketplace
// (read-only). Future write target: fc_regular_forecast (no handler yet → read-only + notice).
function handleFcUpdate(sku, country, marketplace) {
  var DB = (window.KM && window.KM.DB) || {};
  var fcRows = ((DB.getFcRegularForecast && DB.getFcRegularForecast()) || []).filter(function(r) {
    return _roUpper(r.sku) === _roUpper(sku) &&
      (!r.country || !country || _roUpper(r.country) === _roUpper(country)) &&
      (!r.marketplace || !marketplace || _roLower(r.marketplace) === _roLower(marketplace));
  });
  var next3 = _roNextMonths(3);
  var rows = next3.map(function(mo) {
    var row = fcRows.filter(function(r) { return String(r.year) === String(mo.year); })[0] || fcRows[0];
    var v = row ? parseFloat(row[mo.key]) : NaN;
    return '<tr><td>' + mo.label + '</td><td>' + (isNaN(v) ? '--' : v.toLocaleString()) + '</td></tr>';
  }).join('');
  var body =
    '<div class="ro-modal-row"><span>SKU</span><strong>' + _roEsc(sku) + '</strong></div>' +
    '<div class="ro-modal-row"><span>Country / Marketplace</span><strong>' + _roEsc(country || '--') + ' / ' + _roEsc(marketplace || '--') + '</strong></div>' +
    '<table class="ro-expand-table" style="margin-top:8px;"><thead><tr><th>Month</th><th>Regular FC Qty</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="ro-modal-note">Source / future write target: <code>fc_regular_forecast</code>. Read-only in v1 — no save handler yet.</p>';
  _roOpenModal('FC Update', body);
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
  const drafts = [];        // { item, lines: [{ bucket, month, orderQty, note, upc, carton, fcQty, targetPct }] }
  const cartonErrors = [];  // full-carton violations → block Send
  rows.forEach(function(item) {
    const edits = requestOrderState.allocEdits[_roAllocKey(item)] || {};
    const upc = parseFloat(item.boxSize) || 0;
    const lines = [];
    buckets.forEach(function(b) {
      const e = edits[b]; if (!e) return;
      const q = parseInt(e.orderQty, 10) || 0;
      if (q <= 0) return;
      // Full-carton rule: when units/carton is known, order_qty must be an exact multiple.
      if (upc > 0 && (q % upc !== 0)) {
        cartonErrors.push(item.sku + ' / ' + (item.country || '--') + ' / ' + (item.marketplace || '--') +
          ' · ' + b + ': ' + q + ' not a multiple of ' + upc + '/ctn');
        return;
      }
      const mo = _roBucketMonthObj(b);
      const moYm = mo ? (mo.year + '-' + String(mo.idx + 1).padStart(2, '0')) : '';
      const fcQty = _roFcForItemMonth(item, mo);
      lines.push({
        bucket: b, month: e.month || moYm, orderQty: q, note: e.note || '',
        upc: upc, carton: upc > 0 ? Math.round(q / upc) : '',
        fcQty: (fcQty == null ? '' : fcQty),
        targetPct: mo ? _roTargetPct(item, mo) : '',
        siteStock: (item.siteStock == null ? '' : item.siteStock),
        thirdPartyStock: (item.thirdPartyStock == null ? '' : item.thirdPartyStock),
        factoryStock: (item.factoryStock == null ? '' : item.factoryStock)
      });
    });
    if (lines.length) drafts.push({ item: item, lines: lines });
  });

  // Gate 2 (data integrity): block Send when any selected line is not a full carton.
  if (cartonErrors.length) {
    alert('Full-carton required before Send Request. Fix these Order Qty values (must be a multiple of units/carton):\n\n' +
      cartonErrors.slice(0, 20).join('\n') + (cartonErrors.length > 20 ? ('\n… +' + (cartonErrors.length - 20) + ' more') : ''));
    return;
  }

  if (!drafts.length) {
    alert('No positive Order Qty in ' + typeLabel + '.\n\nOpen a confirmed SKU’s Order Allocation and enter Order Qty (T1/T2/T3) first.');
    return;
  }

  const totalUnits = drafts.reduce(function(s, d) { return s + d.lines.reduce(function(a, l) { return a + l.orderQty; }, 0); }, 0);
  let msg = 'Send Request — ' + typeLabel + '\n\nSKU rows: ' + drafts.length + '\nTotal units: ' + totalUnits.toLocaleString() + '\n\nGrouped into Request Order Draft(s) by Series (supplier/factory pending).\n\nProceed?';
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
        units_per_carton: l.upc || '',
        forecast_qty: l.fcQty, current_stock: l.siteStock,          // snapshots (same sources as 下單系統 table)
        calculation_method: 'manual_order_allocation', line_status: 'draft',
        need_reason: 'Order Allocation ' + l.bucket + ' ' + (l.month || ''),
        note: (d.item.company || '--') + ' / ' + (d.item.country || '--') + ' / ' + (d.item.marketplace || '--') +
              ' · ' + l.bucket + ' ' + (l.month || '') + (l.note ? (' — ' + l.note) : ''),
        related_entity_type: 'request_order_allocation', related_entity_id: ''
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
        planning_cycle: cycle, company: d.item.company || '', country: d.item.country || '',
        marketplace: d.item.marketplace || '', sku: d.item.sku, category: d.item.category || '',
        series: d.item.series || '', status: 'site_confirmed', source_type: 'manual', created_by: 'request-order'
      });
      const draftId = hdr && (hdr.request_allocation_draft_id || hdr.requestAllocationDraftId);
      if (draftId) {
        draftIds.push(draftId);
        await DB.upsertRequestOrderAllocationDraftLines({
          request_allocation_draft_id: draftId,
          lines: d.lines.map(function(l) {
            return {
              request_month: l.month, request_bucket: l.bucket, order_qty: l.orderQty,
              carton_qty: l.carton, units_per_carton: l.upc,
              factory_stock_snapshot: l.factoryStock, site_stock_snapshot: l.siteStock,
              third_party_stock_snapshot: l.thirdPartyStock, fc_qty_snapshot: l.fcQty,
              target_pct_snapshot: l.targetPct, note: l.note, allocation_method: 'manual'
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

window.setRequestOrderSeries = setRequestOrderSeries;
window.setRequestOrderCategory = setRequestOrderCategory;
window.handleRequestOrderSearch = handleRequestOrderSearch;
window.setRequestOrderShowMode = setRequestOrderShowMode;
window.handleSendRequest = handleSendRequest;
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
            });
        },
        unmount() {
            console.log('[RequestOrder] unmount');
        }
    });
}
