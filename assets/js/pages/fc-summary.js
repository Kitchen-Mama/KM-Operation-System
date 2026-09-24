// FC Summary - Mock Data and Logic

// Pagination state
const fcPaginationState = {
  currentPage: 1,
  pageSize: 25,
  totalItems: 0
};

// Get data from data.js
const fcRegularMock = window.fcRegularData || [];
const fcEventMock = window.fcEventData || [];

// ── FC Summary filters — shared KM.ui.multiFilter (Round 3) ──────────────────────────────────────
// Company / Marketplace / Country / Category / Series / Event Type migrated from the page's own
// `fc-dropdown` checkbox panels to the ONE shared component. Positive-inclusion semantics are PRESERVED
// exactly: default = ALL values selected (show all); a subset = only those; NONE selected = show nothing
// (emptyMeansAll:false). Within a filter OR; across filters AND. Options are the FULL distinct set per
// dimension from the active dataset — FC Summary is deliberately NON-CASCADING (faceted narrowing was
// removed as a canonical decision; see FC_SUMMARY_SPEC §13 / DATABASE_RELATIONSHIP_MAP §13), so no
// dimension hides another's options. Year stays a native <select>; SKU stays a free-text contains search.
var fcFilterState = { company: [], marketplace: [], country: [], category: [], series: [], event: [] };

// Read the current filters from the shared-component state (single owner; no DOM checkbox scraping).
function getFcFilters() {
  return {
    year: document.getElementById('fc-year-select').value,
    companies: fcFilterState.company.slice(),
    marketplaces: fcFilterState.marketplace.slice(),
    countries: fcFilterState.country.slice(),
    categories: fcFilterState.category.slice(),
    series: fcFilterState.series.slice(),
    events: fcFilterState.event.slice(),
    sku: document.getElementById('fc-sku-input').value.trim().toLowerCase()
  };
}

// Create-or-update ONE shared multi-select on its mount, defaulting to ALL options selected (matches the
// legacy "All checked" default; none-checked = show nothing). onChange writes the array back to state and
// re-renders both tables. Idempotent: safe to call on every populate/reload.
function _fcApplyFilter(key, label, mountId, options) {
  if (!(window.KM && window.KM.ui && window.KM.ui.multiFilter)) return;
  var mount = document.getElementById(mountId);
  if (!mount) return;
  var allVals = (options || []).map(function (o) { return (o && typeof o === 'object') ? String(o.value) : String(o); });
  KM.ui.multiFilter.create({
    mount: mount, filterId: mountId, label: label, options: options || [],
    selectedValues: allVals,        // default = ALL selected (positive-inclusion default)
    emptyMeansAll: false,           // none checked → show nothing (FC semantics)
    allText: 'All', noneText: 'None',
    onChange: function (vals) {
      fcFilterState[key] = vals;
      fcPaginationState.currentPage = 1;
      renderFcRegularTable();
      renderFcEventTable();
    }
  });
  if (mount.__kmfCtl) fcFilterState[key] = mount.__kmfCtl.getSelected();
}

// (Re)build every FC filter's option universe from the ACTIVE dataset (Demo ON → demo mock; Demo OFF → DB
// fc_regular_forecast + fc event data). Each dimension gets its FULL distinct set (non-cascading). Called
// once per load / data reload / demo toggle — NOT on every render (renders read state only).
function _fcSyncFilterOptions() {
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  var regular = demoOn ? _getDemoFcRegularData() : _getDbFcRegularData();
  var events = demoOn ? _getDemoFcEventData() : _getDbFcEventData();
  function distinct(arr) { var o = [], s = {}; (arr || []).forEach(function (v) { v = String(v == null ? '' : v).trim(); if (v && !s[v]) { s[v] = 1; o.push(v); } }); return o.sort(); }
  /* FC-SUMMARY-R3-R1 — THE UNIVERSE IS THE COMPLETE ONE, WHETHER OR NOT THE ROWS ARE HERE.

     This page is deliberately non-cascading: every dimension keeps its FULL option set, and it used to
     get that set by deriving it from all 496 Regular Forecast rows. Bootstrap no longer ships those
     rows, so the server derives the same sets from the same complete tables and sends them as facets —
     trim, drop blanks, default sort, identical rule. When a facet is present it IS the universe; when it
     is not (Demo, Legacy, or a slice that carried none) the rows in hand derive it exactly as before.

     Preferring the facet is not an optimisation, it is the correctness condition. Deriving from rows the
     page happens to be holding would SHRINK the dropdowns the moment a slice was not loaded, which is a
     user-visible change to what can be selected. */
  var F = (!demoOn && _fcReadModel && _fcReadModel.facets) ? _fcReadModel.facets : null;
  function universe(name, fromRows) {
    return (F && Array.isArray(F[name])) ? F[name].slice() : distinct(fromRows);
  }
  _fcApplyFilter('company', 'Company', 'fc-f-company-mount', universe('companies', (regular || []).map(function (r) { return r.company; })));
  _fcApplyFilter('marketplace', 'Marketplace', 'fc-f-marketplace-mount',
    universe('marketplaces', (regular || []).map(function (r) { return r.marketplace; })).map(function (mk) { return { value: mk, label: _fcMarketplaceLabel(mk) }; }));
  _fcApplyFilter('country', 'Country', 'fc-f-country-mount', universe('countries', (regular || []).map(function (r) { return r.country; })));
  _fcApplyFilter('category', 'Category', 'fc-f-category-mount', universe('categories', (regular || []).map(function (r) { return r.category; })));
  _fcApplyFilter('series', 'Series', 'fc-f-series-mount', universe('series', (regular || []).map(function (r) { return r.series; })));
  _fcApplyFilter('event', 'Event Type', 'fc-f-event-mount', universe('events', (events || []).map(function (e) { return e.event; })));
}

// Filter Regular Forecast data.
// Checkbox-dimension semantics (Company / Marketplace / Country / Category / Series):
//   all checked (default) → every value included → all rows shown;
//   a subset checked      → only those values shown;
//   NONE checked (All toggled off) → show NOTHING for that dimension (empty until the user selects).
// Matching is by internal value (marketplace = canonical key), never the display label.
function filterFcRegular(data, filters) {
  return data.filter(item => {
    if (filters.year && item.year.toString() !== filters.year) return false;
    if (!filters.companies.includes(item.company)) return false;
    if (!filters.marketplaces.includes(item.marketplace)) return false;
    if (!filters.countries.includes(item.country)) return false;
    if (!filters.categories.includes(item.category)) return false;
    if (!filters.series.includes(item.series)) return false;
    if (filters.sku && !item.sku.toLowerCase().includes(filters.sku)) return false;
    return true;
  });
}

// Filter Event Forecast data (same "none checked → show nothing" semantics as filterFcRegular).
function filterFcEvent(data, filters) {
  return data.filter(item => {
    if (filters.year && item.year.toString() !== filters.year) return false;
    if (!filters.companies.includes(item.company)) return false;
    if (!filters.marketplaces.includes(item.marketplace)) return false;
    if (!filters.countries.includes(item.country)) return false;
    if (!filters.events.includes(item.event)) return false;
    if (filters.sku && !item.sku.toLowerCase().includes(filters.sku)) return false;
    return true;
  });
}

/* ── FC SHARE — ONE OWNER, AND IT IS NOT THIS PAGE (FC-SHARE-DUAL-MODEL-R1) ────────────────────

   What used to live here was `calculateFcPercentages`, a page-local formula with no spec owner and
   no test, and it was wrong in five independent ways. The one that produced the operator report:
   its entry key was `company-sku-marketplace`, which DROPS COUNTRY. Measured by running the shipped
   function over KM/US/Amazon 1200, KM/CA/Amazon 600, KM/JP/Amazon 300 — three sites the page's OWN
   `fcRowIdentityKey` calls distinct — all three collapsed onto one entry, the last write won, and
   every row displayed 14.3%. Total on screen: 42.9%. The correct shares are 57.1 / 28.6 / 14.3.

   The other four: the denominator was the FILTERED set (unchecking a marketplace moved every other
   row); it was computed over the filtered set but displayed 25 rows at a time; its numerator was
   twelve individually ceiled months of one CALENDAR YEAR rather than the canonical rolling basis;
   and it rounded per row to 1dp then validated the UNROUNDED sum, so 33.3×3 = 99.9 never warned.

   The math now lives in KMFCS (assets/js/core/supply-planning-forecast-share.js), which borrows its
   site identity, its window definition and its factory-source policy from KMFSA rather than
   restating them. This file owns only WHICH ROWS to hand it and HOW TO RENDER the answer.

   THE GRAIN: THE SELECTED YEAR, AND WHY THAT IS NOT THE SUBSTITUTION R1 REFUSED.

   R1 shipped these columns reading "—". The canonical ALLOCATION basis is Σ RAW Regular FC over
   M+1..M+4, anchored on a calculation month, and FC Summary has no such anchor: 58_ returns a read
   timestamp, `km-api-foundation.js`'s `lastCalculationMonth` is a diagnostic of a recommendation
   request this page never issues, IR's month is operator-entered on that page, and Site Inventory
   injects `new Date()` — KMFSA never reads a clock, the PAGE does. There is still no `planning_cycles`
   table and still no global anchor owner. None of that has changed.

   WHAT CHANGED IS THE QUESTION THESE TWO COLUMNS ASK. They are DIAGNOSTIC / REVIEW metrics, not
   allocation weights, and the operator decided they should describe the year that is on screen. So
   the basis is the SELECTED YEAR's Regular Forecast, and the headings say "Annual" so that nobody
   can read them as the thing they are not.

   This is NOT the substitution R1 refused, and the difference is exactly the one R1 named. R1 refused
   to answer "what is this site's rolling planning-window share" with an annual number under a heading
   that promised the rolling one. Here the heading promises the annual number and the annual number is
   what is computed — the column and its formula agree, which is the whole of the original defect. The
   browser clock is still refused outright: it is invisible, it is the viewer's own machine, and two
   operators comparing screens across midnight would see different shares of the same forecast. The
   selected year is the opposite of that — it is operator-chosen, it is visible in the control above
   the table, and it already governs every other column in this row.

   NO PLANNING MONTH CONTROL IS ADDED (§7). The rolling projection KMFCS still owns — `project()` /
   `siteShares()` — is untouched and unread by this page. KMOOP and KMFSA keep their own planning-cycle
   anchors and their own formulas; nothing here is a weight and nothing downstream reads it. */

var _FC_SHARE_DASH_ = '\u2014';

function _fcShareRuntime_() {
  return (typeof window !== 'undefined' && window.KM && window.KM.forecastShare) ||
         (typeof KMFCS !== 'undefined' ? KMFCS : null);
}
/* The selected year, taken from the SAME filter state the table itself draws from. Asking
   `getFcFilters()` rather than reading the <select> keeps one answer to "which year is this table
   showing": a share computed from a different year than the rows beside it would be the original
   defect wearing a new hat. */
function _fcShareYear_() {
  try {
    var f = (typeof getFcFilters === 'function') ? getFcFilters() : null;
    return (f && f.year) ? String(f.year) : '';
  } catch (e) { return ''; }
}

/* Why the share is asked of the RAW read-model rows and not of the rows being rendered: the render
   shape ceils each month for whole-unit display, and a ceiling applied twelve times is a display
   convenience, not a forecast. It must never become an allocation basis. The raw rows are also the
   complete set — the render list is about to be filtered and paginated, and a share computed from
   either of those is a share of the view rather than of the data. */
var _FC_SHARE_MONTHS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function _fcShareRowShape_(r) {
  if (!r) return null;
  var out = { company: r.company, country: r.country, marketplace: r.marketplace, sku: r.sku, year: r.year };
  var i;
  if (Object.prototype.toString.call(r.months) === '[object Array]') {
    for (i = 0; i < 12; i++) out[_FC_SHARE_MONTHS_[i]] = Number(r.months[i]) || 0;
  } else {
    for (i = 0; i < 12; i++) out[_FC_SHARE_MONTHS_[i]] = Number(r[_FC_SHARE_MONTHS_[i]]) || 0;
  }
  return out;
}
function _fcShareSourceRows_(fallbackRows) {
  if (_fcUseDb()) {
    try { var rawRows = _fcGetRegularForecast(); if (rawRows && rawRows.length) return rawRows; } catch (e) {}
  }
  return fallbackRows || [];
}

/* ONE projection per master SKU over the COMPLETE row set. `rows` must be the authoritative
   UNFILTERED set: passing the filtered or paginated list is the defect this replaced, and §12 says
   so in as many words. Every row of every year is handed over — `projectAnnual` selects the year
   itself, because a share whose denominator was pre-filtered by its caller is a share of whatever
   the caller felt like including. */
function _fcAnnualShareProjections_(rows, year) {
  var K = _fcShareRuntime_();
  if (!K || typeof K.projectAnnual !== 'function') {
    return { available: false, reason: 'FC_SHARE_RUNTIME_ABSENT', bySku: {} };
  }
  var y = K.resolveYear(year);
  if (y.state !== K.YEAR_VALID) return { available: false, reason: y.state, bySku: {} };
  var bySku = {};
  (rows || []).forEach(function (r) {
    var shaped = _fcShareRowShape_(r);
    if (!shaped) return;
    var s = String(shaped.sku || '').toUpperCase();
    if (!s) return;
    (bySku[s] = bySku[s] || []).push(shaped);
  });
  var proj = {};
  Object.keys(bySku).forEach(function (s) {
    proj[s] = K.projectAnnual({ sku: bySku[s][0].sku, forecastRows: bySku[s], year: y.year });
  });
  return { available: true, reason: '', bySku: proj };
}

/* The two displayed cells. BOTH are diagnostics over the selected year. There is deliberately no
   eligible-receiver cell: that share answers "who may receive THIS factory source", FC Summary has
   no factory-source context, and the annual projection does not compute one at all (§8). A null
   share renders as an em dash, never 0.0% — "no share is defined" and "this site's share is
   nothing" are different facts, and conflating them is how the old column lied quietly. */
function _fcShareCells_(projections, item) {
  var K = _fcShareRuntime_();
  if (!K || !projections || !projections.available) return { company: _FC_SHARE_DASH_, site: _FC_SHARE_DASH_ };
  var p = projections.bySku[String((item && item.sku) || '').toUpperCase()];
  if (!p) return { company: _FC_SHARE_DASH_, site: _FC_SHARE_DASH_ };
  var s = K.annualSiteShares(p, item);
  return { company: K.formatShare(s.companyAnnualShare), site: K.formatShare(s.allSiteAnnualShare) };
}

/* Why the cell carries a title: an em dash with no explanation reads as a bug. The AVAILABLE title is
   the one §9 requires on every share cell — the column heading is short for width, so the sentence
   that says what the number is has to be reachable from the number itself. */
var _FC_SHARE_TITLE_ = 'Selected-year Regular Forecast share; diagnostic only.';
function _fcShareUnavailableTitle_(projections) {
  if (projections && projections.available) return _FC_SHARE_TITLE_;
  return _FC_SHARE_TITLE_ + ' No year is selected, so no annual share can be calculated. ' +
         'This is never substituted with a planning-window share or with a browser-clock month.';
}

// Render Regular Forecast Table
function renderFcRegularTable() {
  const fixedBody = document.getElementById('fc-regular-fixed-body');
  const scrollBody = document.getElementById('fc-regular-scroll-body');
  const filters = getFcFilters();
  
  // Check if year is selected
  if (!filters.year) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">Please select a year to view data</div>';
    updatePaginationInfo(0);
    return;
  }
  
  // === Data source: Demo ON -> demo mapping; Demo OFF -> Google Sheet fc_regular_forecast ===
  var _fcRegularSource = [];
  if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
    _fcRegularSource = _getDemoFcRegularData();
  } else {
    _fcRegularSource = _getDbFcRegularData();
  }
  // === End Data source ===
  const filteredData = filterFcRegular(_fcRegularSource, filters);
  
  // Paginate data
  const startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  const endIdx = startIdx + fcPaginationState.pageSize;
  const paginatedData = filteredData.slice(startIdx, endIdx);

  if (paginatedData.length === 0) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">No data found</div>';
    updatePaginationInfo(filteredData.length);
    return;
  }

  // FC Share — from the AUTHORITATIVE UNFILTERED set. Never filteredData (the denominator would
  // follow the filter) and never paginatedData (the visible column could not sum to 100).
  const fcShareProj = _fcAnnualShareProjections_(_fcShareSourceRows_(_fcRegularSource), _fcShareYear_());
  const fcShareTitle = _fcShareUnavailableTitle_(fcShareProj);

  // Render fixed column (SKU)
  fixedBody.innerHTML = paginatedData.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell">${item.sku}</div>
    </div>
  `).join('');

  // Render scrollable columns
  scrollBody.innerHTML = paginatedData.map(item => {
    const total = item.months.reduce((sum, val) => sum + val, 0);
    const share = _fcShareCells_(fcShareProj, item);
    return `
      <div class="scroll-row">
        <div class="scroll-cell">${item.year}</div>
        <div class="scroll-cell">${item.company}</div>
        <div class="scroll-cell">${_fcMarketplaceLabel(item.marketplace, item.company, item.country)}</div>
        <div class="scroll-cell">${item.country}</div>
        <div class="scroll-cell">${item.category}</div>
        <div class="scroll-cell">${item.series}</div>
        ${item.months.map(m => `<div class="scroll-cell cell-month">${m.toLocaleString()}</div>`).join('')}
        <div class="scroll-cell cell-total">${total.toLocaleString()}</div>
        <div class="scroll-cell cell-percentage" title="${fcShareTitle}">${share.company}</div>
        <div class="scroll-cell cell-percentage" title="${fcShareTitle}">${share.site}</div>
      </div>
    `;
  }).join('');

  updatePaginationInfo(filteredData.length);
  syncFcScroll('regular');
}

// Render Event Forecast Table
function renderFcEventTable() {
  const fixedBody = document.getElementById('fc-event-fixed-body');
  const scrollBody = document.getElementById('fc-event-scroll-body');
  const filters = getFcFilters();
  
  // Check if year is selected
  if (!filters.year) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">Please select a year to view data</div>';
    updatePaginationInfo(0);
    return;
  }
  
  // === Data source: Demo ON -> demo mapping; Demo OFF -> Google Sheet fc_special_events ===
  var _fcEventSource;
  if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
    _fcEventSource = _getDemoFcEventData();
  } else {
    _fcEventSource = _getDbFcEventData();
  }
  // === End Data source ===
  const filteredData = filterFcEvent(_fcEventSource, filters);
  
  // Paginate data
  const startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  const endIdx = startIdx + fcPaginationState.pageSize;
  const paginatedData = filteredData.slice(startIdx, endIdx);

  if (paginatedData.length === 0) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">No data found</div>';
    updatePaginationInfo(filteredData.length);
    return;
  }

  // Calculate FC占比 for Event
  /* FC-SHARE-DUAL-MODEL-R1 §B10 — the Event share column is GONE. It divided one event's fc_qty by
     the same event's total across marketplaces, which is a share of Special Event demand. No
     allocator anywhere consumes that: the canonical weight is RAW REGULAR FC over M+1..M+4, and
     Special Event FC is explicitly "NEVER folded in" (KMPCX:13, KMFSA:26, rules §7). Showing it
     beside a Regular FC share under the same heading invited exactly the reading that it was one.
     fc_special_events has no fc_share column and must not gain one. */

  // Render fixed column (SKU)
  fixedBody.innerHTML = paginatedData.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell">${item.sku}</div>
    </div>
  `).join('');

  // Render scrollable columns
  scrollBody.innerHTML = paginatedData.map(item => {
    return `
      <div class="scroll-row">
        <div class="scroll-cell">${item.year}</div>
        <div class="scroll-cell">${item.company}</div>
        <div class="scroll-cell">${_fcMarketplaceLabel(item.marketplace, item.company, item.country)}</div>
        <div class="scroll-cell">${item.country}</div>
        <div class="scroll-cell">${item.category}</div>
        <div class="scroll-cell">${item.series}</div>
        <div class="scroll-cell">${item.event}</div>
        <div class="scroll-cell">${item.eventPeriod}</div>
        <div class="scroll-cell cell-qty">${item.fcQty.toLocaleString()}</div>
      </div>
    `;
  }).join('');

  updatePaginationInfo(filteredData.length);
  syncFcScroll('event');
}


// Which FC Summary tab is active (regular / event / target).
function _fcActiveTab() {
  const t = document.querySelector('.fc-tab--active');
  return t ? (t.dataset.tab || 'regular') : 'regular';
}

// Filtered row count for the CURRENTLY ACTIVE tab (Regular / Event share one footer, so the footer
// must always reflect the active tab — not whichever table rendered last).
function _fcActiveFilteredCount() {
  const filters = getFcFilters();
  if (!filters.year) return 0;
  const demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  const tab = _fcActiveTab();
  if (tab === 'event') {
    const es = demoOn ? _getDemoFcEventData() : _getDbFcEventData();
    return filterFcEvent(es, filters).length;
  }
  if (tab === 'regular') {
    const rs = demoOn ? _getDemoFcRegularData() : _getDbFcRegularData();
    return filterFcRegular(rs, filters).length;
  }
  return 0;   // target tab is not paginated
}

// Update pagination footer + controls. Always recomputes from the ACTIVE tab (the passed argument,
// if any, is ignored) so the order in which the Regular/Event tables render can never leave a stale
// "Showing 0-0 of 0". Footer is hidden on the (non-paginated) Target tab.
function updatePaginationInfo() {
  const pag = document.querySelector('.fc-pagination');
  const tab = _fcActiveTab();
  if (tab === 'target') { if (pag) pag.style.display = 'none'; return; }
  if (pag) pag.style.display = '';

  const totalItems = _fcActiveFilteredCount();
  fcPaginationState.totalItems = totalItems;
  const totalPages = Math.ceil(totalItems / fcPaginationState.pageSize);
  // Safety clamp (handlers already reset page on filter/page-size/tab change).
  if (fcPaginationState.currentPage > totalPages) fcPaginationState.currentPage = totalPages || 1;

  const startIdx = totalItems === 0 ? 0 : (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize + 1;
  const endIdx = Math.min(fcPaginationState.currentPage * fcPaginationState.pageSize, totalItems);

  document.getElementById('fc-pagination-info').textContent =
    `Showing ${startIdx}-${endIdx} of ${totalItems} rows`;
  document.getElementById('fc-page-number').textContent =
    totalPages === 0 ? 'Page 0 / 0' : `Page ${fcPaginationState.currentPage} / ${totalPages}`;

  document.getElementById('fc-prev-page').disabled = fcPaginationState.currentPage <= 1;
  document.getElementById('fc-next-page').disabled = fcPaginationState.currentPage >= totalPages;
}

// Initialize pagination controls
function initFcPagination() {
  document.getElementById('fc-page-size').addEventListener('change', (e) => {
    fcPaginationState.pageSize = parseInt(e.target.value);
    fcPaginationState.currentPage = 1;
    renderFcRegularTable();
    renderFcEventTable();
  });
  
  document.getElementById('fc-prev-page').addEventListener('click', () => {
    if (fcPaginationState.currentPage > 1) {
      fcPaginationState.currentPage--;
      renderFcRegularTable();
      renderFcEventTable();
    }
  });
  
  document.getElementById('fc-next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(fcPaginationState.totalItems / fcPaginationState.pageSize);
    if (fcPaginationState.currentPage < totalPages) {
      fcPaginationState.currentPage++;
      renderFcRegularTable();
      renderFcEventTable();
    }
  });
}

// Sync horizontal scroll between header and body
function syncFcScroll(type) {
  const scrollCol = document.getElementById(`fc-${type}-scroll-col`);
  const scrollHeader = document.getElementById(`fc-${type}-scroll-header`);
  
  if (!scrollCol || !scrollHeader) return;

  scrollCol.addEventListener('scroll', function() {
    scrollHeader.style.transform = `translateX(-${this.scrollLeft}px)`;
  });
}

// Initialize Tabs
function initFcTabs() {
  const tabs = document.querySelectorAll('.fc-tab');
  const panels = document.querySelectorAll('.fc-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update active tab
      tabs.forEach(t => t.classList.remove('fc-tab--active'));
      tab.classList.add('fc-tab--active');

      // Update active panel
      panels.forEach(panel => {
        if (panel.id === `fc-panel-${targetTab}`) {
          panel.classList.add('fc-panel--active');
        } else {
          panel.classList.remove('fc-panel--active');
        }
      });
      
      // Update action buttons based on tab
      updateActionButtons(targetTab);

      // FC-SUMMARY-R3-R1 — the tab's own slice is fetched on FIRST activation and never on mount. A tab
      // already in memory renders immediately and issues nothing.
      if (typeof _fcEnsureTabSlice_ === 'function') _fcEnsureTabSlice_(targetTab);

      // Re-render the active tab so the shared pagination footer reflects it (reset to page 1).
      fcPaginationState.currentPage = 1;
      if (targetTab === 'regular') renderFcRegularTable();
      else if (targetTab === 'event') renderFcEventTable();
      else { if (typeof renderTargetRulesTable === 'function') renderTargetRulesTable(); updatePaginationInfo(); }
    });
  });
}

// Update action buttons based on active tab
function updateActionButtons(tab) {
  // Hide all buttons first
  document.querySelectorAll('.fc-btn-regular, .fc-btn-event, .fc-btn-target').forEach(btn => {
    btn.style.display = 'none';
  });
  
  // Show buttons for active tab
  if (tab === 'regular') {
    // Show New FC Update button
    const newFcBtn = document.querySelector('.fc-btn-event[onclick="openAddEventModal()"]');
    if (newFcBtn) newFcBtn.style.display = 'inline-flex';
    
    // Show Regular buttons
    document.querySelectorAll('.fc-btn-regular').forEach(btn => {
      if (btn.id === 'fc-edit-btn' || btn.id === 'fc-add-btn' || btn.id === 'fc-import-btn') {
        btn.style.display = fcEditState.isEditing ? 'none' : 'inline-flex';
      } else if (btn.id === 'fc-save-btn' || btn.id === 'fc-cancel-btn') {
        btn.style.display = fcEditState.isEditing ? 'inline-flex' : 'none';
      }
    });
  } else if (tab === 'event') {
    // Show New FC Update button
    const newFcBtn = document.querySelector('.fc-btn-event[onclick="openAddEventModal()"]');
    if (newFcBtn) newFcBtn.style.display = 'inline-flex';
    
    // Show Event Edit buttons
    const editBtn = document.getElementById('fc-event-edit-btn');
    const saveBtn = document.getElementById('fc-event-save-btn');
    const cancelBtn = document.getElementById('fc-event-cancel-btn');
    
    if (editBtn) editBtn.style.display = fcEditState.isEditingEvent ? 'none' : 'inline-flex';
    if (saveBtn) saveBtn.style.display = fcEditState.isEditingEvent ? 'inline-flex' : 'none';
    if (cancelBtn) cancelBtn.style.display = fcEditState.isEditingEvent ? 'inline-flex' : 'none';
  } else if (tab === 'target') {
    document.querySelectorAll('.fc-btn-target').forEach(btn => {
      btn.style.display = 'inline-flex';
    });
  }
  // FC-SUMMARY-DISPLAY-COLUMN-VISIBILITY-R1 §12.6 — the toolbar's popovers follow the tab. The two
  // relocated menu items are the SAME elements the loop above just showed or hid, so nothing here
  // decides their visibility a second time; this only picks the reset item for the table now on
  // screen, hides the divider when nothing sits above it, and closes anything left open.
  if (typeof fcCloseToolbarMenus_ === 'function') fcCloseToolbarMenus_();
  if (typeof _fcMoreOptionsSyncTab_ === 'function') _fcMoreOptionsSyncTab_(tab);
  if (typeof fcRenderDisplayPanel_ === 'function') fcRenderDisplayPanel_();
}

// Initialize Dropdown — Round 3: mount + populate the shared KM.ui.multiFilter controllers from the
// active dataset. The shared component owns open/close, outside-click, Esc, and the checkbox list, so the
// old per-panel trigger/cloneNode/outside-click wiring is gone.
function initFcDropdown() {
  _fcSyncFilterOptions();
}

// Initialize Factory Stock Dropdown
// NOTE: Factory Stock has its own initFactoryStockPage() in factory-stock.js.
// This function is kept as a no-op to prevent legacy calls from breaking.
// Do NOT use cloneNode or rebind events here — factory-stock.js handles its own lifecycle.
function initFactoryDropdown() {
  if (window.initFactoryStockPage) {
    // Defer to factory-stock.js's own initialization
    return;
  }
}

// (Round 3) The old FC filter helpers — the section-wide outside-click closer, toggleFcAll, updateFcFilter,
// and updateFcFilterText — were removed. The shared KM.ui.multiFilter now owns open/close, outside-click,
// Esc, Select All / Clear, the trigger summary label, and selection state (see _fcApplyFilter above). No
// old fc-dropdown DOM / inline onchange / dual owner remains.

// Initialize Search
function initFcSearch() {
  const yearSelect = document.getElementById('fc-year-select');
  const skuInput = document.getElementById('fc-sku-input');

  // Year change triggers data load and resets pagination
  yearSelect.addEventListener('change', () => {
    fcPaginationState.currentPage = 1;
    renderFcRegularTable();
    renderFcEventTable();
  });

  // SKU input with Enter key
  skuInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      fcPaginationState.currentPage = 1;
      renderFcRegularTable();
      renderFcEventTable();
    }
  });
}

// One-time wiring of tabs / search / pagination / modal-overlay listeners.
// These bind plain (non-cloneNode) listeners, so they must run EXACTLY once.
// Markup is partial-loaded (Phase 3-4), so this can only run after #fc-summary-section
// exists. The guard makes it a safe no-op when the markup hasn't been injected yet
// (e.g. on initial DOMContentLoaded before the user opens FC Summary); the page lifecycle
// mount calls it again once the partial is present.
var _fcSummaryStaticInitDone = false;
function _fcSummaryStaticInit() {
  if (_fcSummaryStaticInitDone) return;
  if (!document.getElementById('fc-summary-section')) return;
  initFcTabs();
  initFcSearch();
  initFcPagination();
  updatePaginationInfo(0);
  var overlay = document.getElementById('fc-modal-overlay');
  if (overlay) overlay.addEventListener('click', closeFcModal);
  _fcSummaryStaticInitDone = true;
}

// Initialize on DOM ready (no-op until the FC Summary partial is injected)
document.addEventListener('DOMContentLoaded', () => {
  _fcSummaryStaticInit();
});

// Re-initialize dropdown when FC Summary section is shown
window.initFcSummaryPage = function() {
  setTimeout(() => {
    initFcDropdown();
  }, 50);
};

// ========================================
// BASE FC EDITING FUNCTIONALITY
// ========================================

// Edit state. `dirty` is an identity-keyed overlay (never mutates the live source): key -> { identity,
// base:{months:[12]}, months:{monthIdx:intVal}, invalid:Set }. `editRows` = the immutable snapshot of the exact
// rows currently loaded under the active filter/search scope when edit mode was entered (§6 editable scope).
const fcEditState = {
  isEditing: false,
  isEditingEvent: false,
  currentTab: 'regular',
  modifiedRows: new Map(),
  modifiedEventRows: new Map(),
  originalData: null,
  originalEventData: null,
  dirty: new Map(),
  editRows: null,
  dirtyEvent: new Map(),
  editEventRows: null
};

function _fcUp(v) { return String(v == null ? '' : v).trim().toUpperCase(); }

// The SAME Regular source the read view uses (Demo -> demo mapping; else Google Sheet fc_regular_forecast).
function _fcRegularEditSource() {
  if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
    return _getDemoFcRegularData();
  }
  return _getDbFcRegularData();
}

// PURE — canonical full business identity for a Regular Forecast row (never SKU alone, never row index).
function fcRowIdentityKey(row) {
  row = row || {};
  return [_fcUp(row.year), _fcUp(row.company), _fcUp(row.country), _fcUp(row.marketplace), _fcUp(row.sku)].join('|');
}

// PURE — validate one Base-FC month input. fc_regular_forecast months are whole non-negative units. Explicit "0"
// is valid; blank is INVALID (never silently 0); decimals/negatives/non-numbers are rejected visibly. No locale.
function fcValidateMonthRaw(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (s === '') return { valid: false, reason: 'blank', value: null };
  if (!/^\d+$/.test(s)) return { valid: false, reason: 'not-a-nonneg-integer', value: null };
  var n = Number(s);
  if (!isFinite(n)) return { valid: false, reason: 'not-finite', value: null };
  return { valid: true, value: n };
}

// PURE — build the canonical write payload from dirty entries. ROW-level delta (only changed rows), each row a
// FULL 12-month upsert vector = original months with edited months replaced (unchanged months preserved exactly).
// dirtyEntries: Array<{ identity:{year,company,country,marketplace,sku}, base:{months:[12]}, months:{idx:int} }>.
function fcBuildRegularWriteRows(dirtyEntries) {
  var out = [];
  (dirtyEntries || []).forEach(function (e) {
    var id = e.identity || {};
    var row = { sku: id.sku, year: id.year, company: id.company, country: id.country, marketplace: id.marketplace };
    for (var i = 0; i < REG_MONTH_KEYS.length; i++) {
      var override = e.months && Object.prototype.hasOwnProperty.call(e.months, i) ? e.months[i] : null;
      var baseVal = (e.base && e.base.months && e.base.months[i] != null) ? e.base.months[i] : 0;
      row[REG_MONTH_KEYS[i]] = (override == null) ? baseVal : override;
    }
    out.push(row);
  });
  return out;
}

// Enter edit mode
function enterFcEditMode() {
  // Show confirmation modal (existing UX preserved)
  showFcModal('fc-edit-confirm-modal');
}

// Confirm edit mode — snapshot the exact currently-loaded Regular rows, lock scope-changing controls, render editable.
function confirmFcEdit() {
  closeFcModal();
  fcEditState.isEditing = true;
  fcEditState.dirty = new Map();
  // Immutable snapshot of the currently-loaded (filtered + paginated) live rows.
  var filters = getFcFilters();
  var src = _fcRegularEditSource();
  var filtered = filterFcRegular(src, filters);
  var startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  var endIdx = startIdx + fcPaginationState.pageSize;
  fcEditState.editRows = JSON.parse(JSON.stringify(filtered.slice(startIdx, endIdx)));

  _fcSetEditLock(true);
  // FC-SUMMARY-R2B-A §5 — RE-ASK THE ONE AUTHORITY. `_fcSetEditLock` shows the Save control but never sets
  // `disabled`, and a successful save left it disabled (`_fcSetSaveEnabled(false)`, never reversed on the
  // success path). Re-entering edit mode therefore presented a visible, permanently dead Save until the
  // operator happened to type in a cell. `_fcUpdateEditStatus` is already the single owner of that flag —
  // enabled while editing with no invalid cell — so entry calls it rather than setting the flag a second way.
  _fcUpdateEditStatus();
  renderFcRegularTableEditable();
}

// Render editable table over the immutable edit-scope snapshot. Identity columns are read-only; only Jan–Dec are
// numeric inputs. Any dirty override is re-applied on render (so validation re-renders never lose user input).
function renderFcRegularTableEditable() {
  const fixedBody = document.getElementById('fc-regular-fixed-body');
  const scrollBody = document.getElementById('fc-regular-scroll-body');
  const MONTH_LBL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const rows = fcEditState.editRows || [];

  if (!rows.length) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">No Regular Forecast rows in the current scope to edit</div>';
    _fcUpdateEditStatus();
    return;
  }

  /* The EDIT table shares the page denominator, and for the same reason: an edit list is a scope,
     not the world. It also used to compute the share from the UNEDITED months while displaying a
     total from the edited ones, so the share visibly refused to move while the operator typed. */
  const fcShareProj = _fcAnnualShareProjections_(_fcShareSourceRows_(rows), _fcShareYear_());
  const fcShareTitle = _fcShareUnavailableTitle_(fcShareProj);

  fixedBody.innerHTML = rows.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell fc-cell-readonly">${item.sku}</div>
    </div>
  `).join('');

  scrollBody.innerHTML = rows.map((item, idx) => {
    const key = fcRowIdentityKey(item);
    const entry = fcEditState.dirty.get(key);
    const effMonths = item.months.map((m, i) => (entry && entry.months && Object.prototype.hasOwnProperty.call(entry.months, i)) ? entry.months[i] : m);
    const total = effMonths.reduce((sum, val) => sum + (Number(val) || 0), 0);
    const share = _fcShareCells_(fcShareProj, item);
    return `
      <div class="scroll-row" data-row-idx="${idx}" data-fckey="${key}">
        <div class="scroll-cell fc-cell-readonly">${item.year}</div>
        <div class="scroll-cell fc-cell-readonly">${item.company}</div>
        <div class="scroll-cell fc-cell-readonly">${_fcMarketplaceLabel(item.marketplace, item.company, item.country)}</div>
        <div class="scroll-cell fc-cell-readonly">${item.country}</div>
        <div class="scroll-cell fc-cell-readonly">${item.category}</div>
        <div class="scroll-cell fc-cell-readonly">${item.series}</div>
        ${item.months.map((m, mIdx) => {
          const dirtyVal = (entry && entry.months && Object.prototype.hasOwnProperty.call(entry.months, mIdx)) ? entry.months[mIdx] : null;
          const shown = dirtyVal == null ? m : dirtyVal;
          const invalid = entry && entry.invalid && entry.invalid[mIdx];
          return `
          <div class="scroll-cell cell-month fc-cell-editable">
            <input type="number" step="1" min="0" inputmode="numeric"
                   class="fc-month-input${invalid ? ' fc-cell-invalid' : ''}"
                   value="${shown}"
                   data-fckey="${key}" data-midx="${mIdx}"
                   aria-label="${item.sku} ${MONTH_LBL[mIdx]} forecast"
                   aria-invalid="${invalid ? 'true' : 'false'}"
                   oninput="updateFcMonth(this)">
          </div>`;
        }).join('')}
        <div class="scroll-cell cell-total">${total.toLocaleString()}</div>
        <div class="scroll-cell cell-percentage" title="${fcShareTitle}">${share.company}</div>
        <div class="scroll-cell cell-percentage" title="${fcShareTitle}">${share.site}</div>
      </div>
    `;
  }).join('');

  _fcUpdateEditStatus();
  syncFcScroll('regular');
}

// Update one month cell. Tracks dirty per (identity, month); explicit 0 valid, blank invalid, preserves unchanged.
function updateFcMonth(inputEl) {
  const key = inputEl.getAttribute('data-fckey');
  const mIdx = parseInt(inputEl.getAttribute('data-midx'), 10);
  const base = (fcEditState.editRows || []).find(r => fcRowIdentityKey(r) === key);
  if (!base) return;

  let entry = fcEditState.dirty.get(key);
  if (!entry) { entry = { identity: { year: base.year, company: base.company, country: base.country, marketplace: base.marketplace, sku: base.sku }, base: { months: base.months.slice() }, months: {}, invalid: {} }; }

  const v = fcValidateMonthRaw(inputEl.value);
  const baseVal = Number(base.months[mIdx]) || 0;
  if (!v.valid) {
    entry.invalid[mIdx] = true;
    inputEl.classList.add('fc-cell-invalid');
    inputEl.setAttribute('aria-invalid', 'true');
    // keep a placeholder override so the row is treated as dirty (blocks save) but never coerces blank->0
    entry.months[mIdx] = null;
    fcEditState.dirty.set(key, entry);
  } else {
    delete entry.invalid[mIdx];
    inputEl.classList.remove('fc-cell-invalid');
    inputEl.setAttribute('aria-invalid', 'false');
    if (v.value === baseVal) { delete entry.months[mIdx]; } else { entry.months[mIdx] = v.value; }
    // prune a fully-clean entry
    if (Object.keys(entry.months).length === 0 && Object.keys(entry.invalid).length === 0) { fcEditState.dirty.delete(key); }
    else { fcEditState.dirty.set(key, entry); }
  }

  // Live row total from base + overrides (valid only).
  const eff = base.months.map((m, i) => {
    const cur = fcEditState.dirty.get(key);
    if (cur && cur.months && Object.prototype.hasOwnProperty.call(cur.months, i) && cur.months[i] != null) return cur.months[i];
    return Number(m) || 0;
  });
  const row = inputEl.closest('.scroll-row');
  if (row) { const tc = row.querySelector('.cell-total'); if (tc) tc.textContent = eff.reduce((s, x) => s + (Number(x) || 0), 0).toLocaleString(); }

  _fcUpdateEditStatus();
}

// Count changed cells + any invalid cells across dirty entries.
function _fcEditCounts() {
  let changed = 0, invalid = 0;
  fcEditState.dirty.forEach(e => {
    Object.keys(e.months || {}).forEach(k => { if (e.months[k] != null) changed++; });
    invalid += Object.keys(e.invalid || {}).length;
  });
  return { changed: changed, invalid: invalid };
}

// Edit-mode status banner + Save enablement (Save disabled while any cell is invalid or nothing changed).
function _fcUpdateEditStatus() {
  const c = _fcEditCounts();
  const el = document.getElementById('fc-edit-status');
  if (el) {
    el.textContent = fcEditState.isEditing
      ? (c.invalid ? ('Edit Mode — ' + c.invalid + ' invalid cell(s)') : ('Edit Mode — ' + c.changed + ' cell(s) changed'))
      : '';
  }
  const save = document.getElementById('fc-save-btn');
  if (save) save.disabled = !fcEditState.isEditing || c.invalid > 0;
}

// Lock/unlock all scope-changing controls during edit mode (Policy A — smallest, cannot silently lose edits).
function _fcSetEditLock(on) {
  const ids = ['fc-year-select', 'fc-sku-input', 'fc-page-size'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) { el.disabled = !!on; } });
  document.querySelectorAll('.fc-filter-mount, .fc-tab, .fc-page-controls, #fc-edit-btn, #fc-add-btn, #fc-import-btn')
    .forEach(el => { el.classList.toggle('fc-scope-locked', !!on); if ('disabled' in el) el.disabled = !!on; el.setAttribute('aria-disabled', on ? 'true' : 'false'); });
  const sec = document.getElementById('fc-summary-section');
  if (sec) sec.classList.toggle('fc-editing', !!on);
  // Save/Cancel visibility
  const save = document.getElementById('fc-save-btn'), cancel = document.getElementById('fc-cancel-btn'), edit = document.getElementById('fc-edit-btn');
  if (save) save.style.display = on ? 'inline-flex' : 'none';
  if (cancel) cancel.style.display = on ? 'inline-flex' : 'none';
  if (edit) edit.style.display = on ? 'none' : 'inline-flex';
  // Edit-mode status banner
  let banner = document.getElementById('fc-edit-status');
  if (on && !banner) {
    banner = document.createElement('span');
    banner.id = 'fc-edit-status';
    banner.className = 'fc-edit-status';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    const bar = document.getElementById('fc-action-buttons');
    if (bar) bar.appendChild(banner);
  } else if (!on && banner) { banner.remove(); }
}

// Save changes — one safe batch upsert through the canonical FC authority. No hardcoded success; readback-verified.
function saveFcChanges() {
  if (!fcEditState.isEditing) return;
  const counts = _fcEditCounts();
  if (counts.invalid > 0) { alert('Please fix invalid month values (whole numbers ≥ 0; blank is not allowed) before saving.'); return; }

  // Collect ONLY changed rows (row-level delta); each row carries full identity + a full 12-month vector.
  const entries = [];
  fcEditState.dirty.forEach(e => { if (Object.keys(e.months || {}).some(k => e.months[k] != null)) entries.push(e); });
  if (entries.length === 0) { exitEditMode(); return; }   // no changes → no DB call
  const toWrite = fcBuildRegularWriteRows(entries);

  const useDb = (typeof _fcUseDb === 'function' && _fcUseDb());
  if (useDb) {
    if (!(window.KM && window.KM.DB && window.KM.DB.importFcRegularForecastBatch)) { alert('Regular forecast write API is not available.'); return; }
    if (!_fcWriteBegin_('baseEdit')) return;       // FC-SUMMARY-R1: extra clicks add zero logical writes
    _fcSetSaveEnabled(false);
    var _beOpts = { ctl: 'baseEdit', op: 'Edit Base FC Save', rows: toWrite.length, epoch: _fcEpoch_(),
      reenable: _fcSetSaveEnabled,
      onSuccess: function (s) {
        // The CONFIRMED write is reported here; the scoped re-read that follows is best effort.
        // Its receipt is a batch summary rather than saved rows, so the Regular slice is re-read — 197 KB
        // and one request, not the 221.6 KB four-table workspace this used to ask for.
        _fcAfterWriteScoped_(FC_SLICE_.REGULAR, function () {
          exitEditMode();   // clears dirty, unlocks scope, re-renders from the scoped read-model / canonical cache
          alert(FC_MSG_.SAVED + ' Base Forecast — ' + toWrite.length + ' row(s), ' + counts.changed + ' cell(s) updated.'
            + _fcCountsLine_(s));
        });
      } };
    window.KM.DB.importFcRegularForecastBatch(toWrite, { forecastStatusDefault: 'draft', sourceDefault: 'fc_summary_base_edit' })
      .then(function (res) { _fcSettleWrite_(res, _beOpts); })
      .catch(function (err) { _fcFailWrite_(err, _beOpts); });
    return;
  }

  // Demo / not-configured: in-memory only, clearly labeled (never a false "saved to DB").
  alert('Base Forecast — DEMO (in-memory only, NOT written to DB).\n' + toWrite.length + ' row(s), ' + counts.changed + ' cell(s).');
  exitEditMode();
}

function _fcSetSaveEnabled(on) { const b = document.getElementById('fc-save-btn'); if (b) b.disabled = !on; }
// FC-SUMMARY-R1 — Target Rules had no id on its Save control and therefore no way to be guarded.
/* FC-SUMMARY-R2B-A3-R5 §1 — TWO QUESTIONS, NOT ONE.
 *
 * A3-R4 added the 'Saving…' label this control had always lacked, and hung it on the only signal the
 * helper carried: `disabled`. That was the defect. `disabled` answers CAN this be saved, and it is
 * driven by the validation gate, which runs on every modal open and every scope change. So opening
 * the Target Rule modal — incomplete by definition, Save correctly disabled — rendered 'Saving…'
 * before the operator had touched anything, and the word stopped meaning that a write was happening.
 *
 * The two facts are now stored apart and rendered together. `valid` is the gate's answer and may
 * close the control; `busy` is the write token's answer and is the ONLY thing permitted to change
 * the label. The disabled attribute is the OR of the two, so nothing that was previously unclickable
 * has become clickable — only the sentence the button was saying has been corrected.
 *
 * The idle label is still read from the markup rather than spelled here, but it is captured ONCE and
 * only while idle, so it can no longer be the word this function itself wrote a moment earlier. */
var _fcTargetSave_ = { valid: false, busy: false };
function _fcRenderTargetSave_() {
  var b = (typeof document === 'undefined') ? null : document.getElementById('fc-target-save-btn');
  if (!b) return;
  if (!_fcTargetSave_.busy && b.dataset && !b.dataset.fcIdleLabel) b.dataset.fcIdleLabel = b.textContent;
  b.disabled = _fcTargetSave_.busy || !_fcTargetSave_.valid;
  if (_fcTargetSave_.busy) {
    b.setAttribute('aria-busy', 'true');
    b.textContent = 'Saving…';
  } else {
    b.removeAttribute('aria-busy');
    b.textContent = (b.dataset && b.dataset.fcIdleLabel) || 'Save';
  }
}
/* CAN it be saved — the validation gate's answer. It may disable; it may never say 'Saving…'. */
function _fcSetTargetSaveEnabled_(on) { _fcTargetSave_.valid = !!on; _fcRenderTargetSave_(); }
/* IS it being saved — the write token's answer, and the only writer of the busy label. */
function _fcSetTargetSaveBusy_(on) { _fcTargetSave_.busy = !!on; _fcRenderTargetSave_(); }

// Cancel edit — zero backend calls; restore originals by dropping the dirty overlay and re-rendering the view.
function cancelFcEdit() {
  const c = _fcEditCounts();
  if ((c.changed > 0 || c.invalid > 0) && !confirm('Discard all unsaved Base Forecast changes?')) return;
  exitEditMode();
}

// Exit edit mode — clear dirty overlay, unlock controls, re-render the canonical read view.
function exitEditMode() {
  fcEditState.isEditing = false;
  fcEditState.dirty = new Map();
  fcEditState.editRows = null;
  fcEditState.modifiedRows.clear();
  fcEditState.originalData = null;
  _fcSetEditLock(false);
  renderFcRegularTable();
}

// ========================================
// EVENT FC EDITING FUNCTIONALITY
// ========================================

// Enter event edit mode
// The SAME Special-Event source the read view uses (Demo -> demo mapping; else Google Sheet fc_special_events).
function _fcEventEditSource() {
  if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
    return _getDemoFcEventData();
  }
  return _getDbFcEventData();
}

// ==============================================================================================
// FC-SUMMARY-R2B-A3-R1 §5 — THE SPECIAL EVENT VERSION TOKEN, PAGE SIDE.
//
// The mirror of FC_SE_FINGERPRINT_FIELDS_ / fcSeFingerprint_ in 14_fc_write_handlers.gs, in this
// order and with this normalisation. The two sides compute the same token over the same values, so
// the server can tell a stale save from a current one without either side trusting a clock.
//
// The two window columns are absent on purpose and the omission is load-bearing, not an oversight:
// a sheet Date read server-side as the local calendar day reaches this page as an ISO instant eight
// hours earlier, and a version check that can fail for a timezone reason teaches operators to click
// past it. The window is the CAMPAIGN's identity and cannot be edited here in any case.
// ==============================================================================================
var _SE_FP_FIELDS_ = ['campaign_id', 'campaign_sku_line_id', 'company', 'country',
  'marketplace', 'marketplace_id', 'scope_type', 'scope_id', 'sku', 'series', 'category',
  'event_name', 'event_period', 'event_month', 'year', 'fc_qty', 'note'];
var _SE_FP_NUMERIC_ = ['event_month', 'year', 'fc_qty'];

/* The row's content fingerprint, computed from the CANONICAL row (the `raw` the read model carries),
   never from the display shape — the display shape renames and rounds, and a token built from it
   would disagree with the sheet for reasons that have nothing to do with anybody editing anything. */
function _seFingerprint_(raw) {
  raw = raw || {};
  var parts = [];
  for (var i = 0; i < _SE_FP_FIELDS_.length; i++) {
    var f = _SE_FP_FIELDS_[i];
    parts.push(_SE_FP_NUMERIC_.indexOf(f) !== -1 ? _trNumTok_(raw[f]) : _trStrTok_(raw[f]));
  }
  return parts.join('|');
}

// The mirror of CAMPAIGN_FINGERPRINT_FIELDS_ in 20_campaign_write_handlers.gs. The key fields —
// HEADER_IDENTITY_KEY: company|country|marketplace|promotion_type|event_flag|start_date|end_date —
// are deliberately NOT here: they are identity, so changing one names a different campaign rather
// than editing this one.
var _CMP_FP_FIELDS_ = ['campaign_name', 'marketplace_id', 'major_event_flag',
  'year', 'duration', 'status'];
var _CMP_FP_NUMERIC_ = ['year', 'duration'];
function _cmpFingerprint_(raw) {
  raw = raw || {};
  var parts = [];
  for (var i = 0; i < _CMP_FP_FIELDS_.length; i++) {
    var f = _CMP_FP_FIELDS_[i];
    parts.push(_CMP_FP_NUMERIC_.indexOf(f) !== -1 ? _trNumTok_(raw[f]) : _trStrTok_(raw[f]));
  }
  return parts.join('|');
}

/* THE CANONICAL EVENT IDENTITY, PAGE SIDE — campaign (which is the WINDOW) + the campaign SKU line.
   Not the campaign NAME: the same name recurs every year and twice within one, and two events that
   share a name are still two events. Mirrors fcSpecialEventFindRowByKey_'s primary key. */
function fcEventCanonicalKey(row) {
  row = row || {};
  var raw = row.raw || row;
  var cmp = _trStrTok_(row.campaignId || raw.campaign_id).toUpperCase();
  var line = _trStrTok_(row.campaignSkuLineId || raw.campaign_sku_line_id).toUpperCase();
  if (cmp && line) return 'CL:' + cmp + '|' + line;
  if (cmp) return 'CS:' + cmp + '|' + _trStrTok_(row.sku || raw.sku).toUpperCase();
  return '';
}

// PURE — dedup key for a Special-Event row. Canonical PK is event_fc_id; fall back to a company-safe composite
// ONLY for legacy rows with a blank id (those still fail closed on save without a campaign_id — never merged).
function fcEventIdentityKey(row) {
  row = row || {};
  var id = _fcUp(row.eventId);
  if (id) return 'EFC:' + id;
  return 'K:' + [_fcUp(row.company), _fcUp(row.country), _fcUp(row.marketplace), _fcUp(row.sku), _fcUp(row.event), _fcUp(row.year)].join('|');
}

// PURE — build the canonical Special-Event write payload (only changed rows). Each row carries the FULL identity the
// write authority requires (event_fc_id for exact targeting + campaign_id + event_name + sku) plus the edited fc_qty.
//
// R2B-A3-R1 §5 — and `expected_row_version`, the fingerprint of the row AS THE OPERATOR SAW IT. Without
// it two people editing the same event both succeeded and the second silently erased the first. The
// server refuses a versionless update outright, so a row whose version could not be computed is sent
// with an empty one and is REFUSED rather than written blind: failing closed is the point.
function fcBuildEventWriteRows(dirtyEntries) {
  return (dirtyEntries || []).map(function (e) {
    var id = e.identity || {};
    return { event_fc_id: id.eventId || '', campaign_id: id.campaignId || '',
      campaign_sku_line_id: id.campaignSkuLineId || '',
      event_name: id.eventName || '', sku: id.sku || '', fc_qty: e.qty,
      expected_row_version: id.rowVersion || '' };
  });
}

// Enter Special-Event edit mode — snapshot the currently-loaded rows, lock scope controls, render editable.
function enterEventEditMode() {
  fcEditState.isEditingEvent = true;
  fcEditState.dirtyEvent = new Map();
  var filters = getFcFilters();
  var src = _fcEventEditSource();
  var filtered = filterFcEvent(src, filters);
  var startIdx = (fcPaginationState.currentPage - 1) * fcPaginationState.pageSize;
  var endIdx = startIdx + fcPaginationState.pageSize;
  fcEditState.editEventRows = JSON.parse(JSON.stringify(filtered.slice(startIdx, endIdx)));
  _fcEventSetEditLock(true);
  _fcEventUpdateStatus();   // FC-SUMMARY-R2B-A §5 — see confirmFcEdit: identical defect, identical fix.
  renderFcEventTableEditable();
}

// Render editable event table — only FC Qty is a numeric input; identity/period columns are read-only.
function renderFcEventTableEditable() {
  const fixedBody = document.getElementById('fc-event-fixed-body');
  const scrollBody = document.getElementById('fc-event-scroll-body');
  const rows = fcEditState.editEventRows || [];

  if (!rows.length) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">No Special Event rows in the current scope to edit</div>';
    _fcEventUpdateStatus();
    return;
  }


  fixedBody.innerHTML = rows.map(item => `
    <div class="fixed-row">
      <div class="fixed-cell fc-cell-readonly">${item.sku}</div>
    </div>
  `).join('');

  scrollBody.innerHTML = rows.map((item, idx) => {
    const key = fcEventIdentityKey(item);
    const entry = fcEditState.dirtyEvent.get(key);
    const shown = (entry && entry.qty != null) ? entry.qty : item.fcQty;
    const invalid = entry && entry.invalid;
    const noId = !String(item.eventId || '').trim() || !String(item.campaignId || '').trim();
    return `
      <div class="scroll-row" data-row-idx="${idx}" data-fckey="${key}">
        <div class="scroll-cell fc-cell-readonly">${item.year}</div>
        <div class="scroll-cell fc-cell-readonly">${item.company}</div>
        <div class="scroll-cell fc-cell-readonly">${_fcMarketplaceLabel(item.marketplace, item.company, item.country)}</div>
        <div class="scroll-cell fc-cell-readonly">${item.country}</div>
        <div class="scroll-cell fc-cell-readonly">${item.category}</div>
        <div class="scroll-cell fc-cell-readonly">${item.series}</div>
        <div class="scroll-cell fc-cell-readonly">${item.event}</div>
        <div class="scroll-cell fc-cell-readonly">${item.eventPeriod}</div>
        <div class="scroll-cell cell-qty fc-cell-editable">
          <input type="number" step="1" min="0" inputmode="numeric"
                 class="fc-event-qty-input${invalid ? ' fc-cell-invalid' : ''}"
                 value="${shown}"
                 data-fckey="${key}"
                 aria-label="${item.sku} ${item.event} forecast quantity"
                 aria-invalid="${invalid ? 'true' : 'false'}"
                 title="${noId ? 'This legacy event is missing event_fc_id / campaign_id — editing it will fail closed until it is backfilled.' : ''}"
                 oninput="updateEventFcQty(this)">
        </div>
      </div>
    `;
  }).join('');

  _fcEventUpdateStatus();
  syncFcScroll('event');
}

// Update one event FC Qty cell. Explicit 0 valid, blank invalid, preserves unchanged; identity keyed by event_fc_id.
function updateEventFcQty(inputEl) {
  const key = inputEl.getAttribute('data-fckey');
  const base = (fcEditState.editEventRows || []).find(r => fcEventIdentityKey(r) === key);
  if (!base) return;
  const v = fcValidateMonthRaw(inputEl.value);   // fc_qty rule = non-negative integer (same as Base FC month)
  const baseVal = Number(base.fcQty) || 0;
  let entry = fcEditState.dirtyEvent.get(key) || { identity: { eventId: base.eventId, campaignId: base.campaignId,
    campaignSkuLineId: base.campaignSkuLineId, rowVersion: base.rowVersion,
    eventName: base.eventName, sku: base.sku }, base: { fcQty: baseVal }, qty: null, invalid: false };
  if (!v.valid) {
    entry.invalid = true; entry.qty = null;
    inputEl.classList.add('fc-cell-invalid'); inputEl.setAttribute('aria-invalid', 'true');
    fcEditState.dirtyEvent.set(key, entry);
  } else {
    entry.invalid = false;
    inputEl.classList.remove('fc-cell-invalid'); inputEl.setAttribute('aria-invalid', 'false');
    if (v.value === baseVal) { fcEditState.dirtyEvent.delete(key); }
    else { entry.qty = v.value; fcEditState.dirtyEvent.set(key, entry); }
  }
  _fcEventUpdateStatus();
}

function _fcEventCounts() {
  let changed = 0, invalid = 0;
  fcEditState.dirtyEvent.forEach(e => { if (e.invalid) invalid++; else if (e.qty != null) changed++; });
  return { changed: changed, invalid: invalid };
}

function _fcEventUpdateStatus() {
  const c = _fcEventCounts();
  const el = document.getElementById('fc-event-edit-status');
  if (el) el.textContent = fcEditState.isEditingEvent ? (c.invalid ? ('Edit Mode — ' + c.invalid + ' invalid') : ('Edit Mode — ' + c.changed + ' changed')) : '';
  const save = document.getElementById('fc-event-save-btn');
  if (save) save.disabled = !fcEditState.isEditingEvent || c.invalid > 0;
}

// Lock/unlock scope-changing controls during Special-Event edit (Policy A, shared with Base FC scope guard).
function _fcEventSetEditLock(on) {
  const ids = ['fc-year-select', 'fc-sku-input', 'fc-page-size'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !!on; });
  document.querySelectorAll('.fc-filter-mount, .fc-tab, .fc-page-controls, #fc-event-edit-btn')
    .forEach(el => { el.classList.toggle('fc-scope-locked', !!on); if ('disabled' in el) el.disabled = !!on; el.setAttribute('aria-disabled', on ? 'true' : 'false'); });
  const sec = document.getElementById('fc-summary-section');
  if (sec) sec.classList.toggle('fc-editing', !!on);
  const save = document.getElementById('fc-event-save-btn'), cancel = document.getElementById('fc-event-cancel-btn'), edit = document.getElementById('fc-event-edit-btn');
  if (save) save.style.display = on ? 'inline-flex' : 'none';
  if (cancel) cancel.style.display = on ? 'inline-flex' : 'none';
  if (edit) edit.style.display = on ? 'none' : 'inline-flex';
  let banner = document.getElementById('fc-event-edit-status');
  if (on && !banner) {
    banner = document.createElement('span');
    banner.id = 'fc-event-edit-status'; banner.className = 'fc-edit-status';
    banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite');
    const bar = document.getElementById('fc-action-buttons'); if (bar) bar.appendChild(banner);
  } else if (!on && banner) { banner.remove(); }
}

// Save Special-Event changes — one safe batch upsert through the canonical FC authority; no false success.
function saveEventChanges() {
  if (!fcEditState.isEditingEvent) return;
  const counts = _fcEventCounts();
  if (counts.invalid > 0) { alert('Please fix invalid FC Qty values (whole numbers ≥ 0; blank is not allowed) before saving.'); return; }
  const entries = [];
  fcEditState.dirtyEvent.forEach(e => { if (e.qty != null) entries.push(e); });
  if (entries.length === 0) { exitEventEditMode(); return; }   // no changes → no DB call
  const toWrite = fcBuildEventWriteRows(entries);
  // Guard: a row missing event_fc_id or campaign_id cannot be safely targeted — the backend fails it closed, but
  // block it up front with a clear message rather than a silent skip.
  const blocked = toWrite.filter(r => !String(r.event_fc_id).trim() || !String(r.campaign_id).trim());
  if (blocked.length) { alert(blocked.length + ' selected event(s) are missing event_fc_id / campaign_id and cannot be edited until backfilled. Fix or revert those rows before saving.'); return; }

  const useDb = (typeof _fcUseDb === 'function' && _fcUseDb());
  if (useDb) {
    if (!(window.KM && window.KM.DB && window.KM.DB.importFcSpecialEventsBatch)) { alert('Special event write API is not available.'); return; }
    if (!_fcWriteBegin_('event')) return;          // FC-SUMMARY-R1: extra clicks add zero logical writes
    _fcEventSetSaveEnabled(false);
    var _evOpts = { ctl: 'event', op: 'Special Event Save', rows: toWrite.length, epoch: _fcEpoch_(),
      reenable: _fcEventSetSaveEnabled,
      onSuccess: function (s) {
        // Per-row refusal inside a confirmed envelope keeps its existing meaning: edits are preserved.
        if (s && s.skipped) {
          alert('Save failed for ' + s.skipped + ' of ' + toWrite.length + ' event(s) — see per-row reasons; edits preserved.');
          _fcEventSetSaveEnabled(true); return;
        }
        _fcAfterWriteScoped_(FC_SLICE_.EVENTS, function () {
          exitEventEditMode();   // scoped fcSummary re-read (Workspace) / reloaded canonical cache (Legacy) → reconcile view
          alert(FC_MSG_.SAVED + ' Special Events — ' + toWrite.length + ' event(s), ' + counts.changed + ' updated.'
            + _fcCountsLine_(s));
        });
      } };
    window.KM.DB.importFcSpecialEventsBatch(toWrite, { source: 'fc_summary_event_edit' })
      .then(function (res) { _fcSettleWrite_(res, _evOpts); })
      .catch(function (err) { _fcFailWrite_(err, _evOpts); });
    return;
  }

  alert('Special Events — DEMO (in-memory only, NOT written to DB).\n' + toWrite.length + ' event(s), ' + counts.changed + ' updated.');
  exitEventEditMode();
}

function _fcEventSetSaveEnabled(on) { const b = document.getElementById('fc-event-save-btn'); if (b) b.disabled = !on; }

// Cancel Special-Event edit — zero backend calls; drop the dirty overlay and re-render the canonical view.
function cancelEventEdit() {
  const c = _fcEventCounts();
  if ((c.changed > 0 || c.invalid > 0) && !confirm('Discard all unsaved Special Event changes?')) return;
  exitEventEditMode();
}

// Exit event edit mode — clear dirty overlay, unlock controls, re-render the canonical read view.
function exitEventEditMode() {
  fcEditState.isEditingEvent = false;
  fcEditState.dirtyEvent = new Map();
  fcEditState.editEventRows = null;
  fcEditState.modifiedEventRows.clear();
  fcEditState.originalEventData = null;
  _fcEventSetEditLock(false);
  renderFcEventTable();
}

// ========================================
// ADD SKU FUNCTIONALITY
// ========================================

function openAddSkuModal() {
  const yearSelect = document.getElementById('fc-year-select');
  const currentYear = new Date().getFullYear();
  
  // Use selected year if available, otherwise use current year
  document.getElementById('add-year-input').value = yearSelect.value || currentYear;
  showFcModal('fc-add-sku-modal');
}

function fillAllMonths(value) {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  months.forEach(m => {
    document.getElementById(`add-${m}`).value = value || 0;
  });
}

function saveNewSku() {
  const sku = document.getElementById('add-sku-input').value.trim();
  const year = parseInt(document.getElementById('add-year-input').value);
  
  if (!sku) {
    alert('SKU is required');
    return;
  }
  
  // Check duplicate
  const exists = fcRegularMock.some(item => 
    item.sku === sku && item.year === year
  );
  
  if (exists) {
    alert('This SKU already exists for the selected year');
    return;
  }
  
  // Create new item
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const newItem = {
    sku,
    year,
    company: document.getElementById('add-company-input').value,
    marketplace: document.getElementById('add-marketplace-input').value,
    country: document.getElementById('add-country-input').value,
    category: document.getElementById('add-category-input').value,
    series: document.getElementById('add-series-input').value,
    months: months.map(m => parseInt(document.getElementById(`add-${m}`).value) || 0)
  };
  
  // Add to data
  fcRegularMock.push(newItem);
  
  // Re-render
  renderFcRegularTable();
  closeFcModal();
  alert('SKU added successfully');
}

// ========================================
// TARGET % RULES FUNCTIONALITY
// ========================================

// Target rules data
const targetRules = [];

// ============================================================================================================
// FC-SUMMARY-R2B-A2-R5 — TARGET RULE CANONICAL SCOPE
//
// WHAT WAS HERE BEFORE. The modal's option lists were static HTML: Marketplace offered All/Amazon/Walmart,
// Category offered All plus three product names, Series offered five codes, and SKU was a free-text box
// validated against `upcomingSkuData`/`runningSkuData`/`phasingOutSkuData` — the demo arrays in
// assets/js/utils/data.js. No code populated any of those lists, so they could not have reflected the
// database. There was no Country control, and the payload carried neither `company` nor `country`, even
// though handleUpsertFcTargetRule_ documents both and the live sheet has both columns.
//
// WHAT IT IS NOW. Every list is derived from the SAME canonical read model the page rendered its table and
// filters from — `_getDbFcRegularData()`, whose rows carry year, company, country, marketplace, category,
// series and sku. Opening the modal issues no request; it reads what is already loaded.
//
// WHY THE PAGE FILTERS ARE NON-CASCADING AND THIS IS. They answer different questions. A filter asks "hide
// rows I don't want to look at", so narrowing its option set would hide data the user can legitimately ask
// for. A scope selector asks "which real thing am I writing a rule against", and an option that does not
// exist in the data is not a thing you can write a rule against. The non-cascading decision recorded in
// FC_SUMMARY_SPEC §13 is about the FILTER BAR and is untouched.
// ============================================================================================================

// Cascade order. Every scope's active set is a PREFIX of this list, which is what makes "clear everything
// downstream" a single slice rather than a per-dimension dependency table.
var _TR_ORDER_ = ['year', 'country', 'marketplace', 'category', 'series', 'sku'];
var _TR_CTL_ = {
  year: 'target-year-input', country: 'target-country-input', marketplace: 'target-marketplace-input',
  category: 'target-category-input', series: 'target-series-input', sku: 'target-sku-input'
};
var _TR_LABEL_ = { year: 'Year', country: 'Country', marketplace: 'Marketplace',
  category: 'Category', series: 'Series', sku: 'SKU' };

// Which dimensions each scope SENDS. The old code sent no category for SKU scope, so a SKU rule recorded no
// category at all; resolveTargetPct reads r.category when scope_id is blank, so that omission was load-bearing.
var _TR_SCOPE_FIELDS_ = {
  CATEGORY: ['category'],
  SERIES: ['category', 'series'],
  SKU: ['category', 'series', 'sku']
};

// ONE mapping between however a scope is spelled and its canonical token, per §5. The three consumers spell
// it differently — normalizeFcTargetRuleRecord lowercases, procurementTargetRuleResolver_ lowercases, and
// the page's own getEffectiveTargetPct compares title-case — so the PERSISTED value must be title case and
// every comparison must go through here rather than retyping a literal.
// R2B-A2-R5-F2 — UPPERCASE is the canonical persisted vocabulary, matching the resolver's one mapping.
// The <select> still offers Category/Series/SKU as display text; _trCanonScope_ is the only translation.
var _TR_SCOPES_ = ['CATEGORY', 'SERIES', 'SKU'];
function _trCanonScope_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  for (var i = 0; i < _TR_SCOPES_.length; i++) {
    if (_TR_SCOPES_[i].toLowerCase() === s) return _TR_SCOPES_[i];
  }
  return '';
}

function _trNorm_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

// The canonical universe — the active dataset, identical to the one the filters and table were built from.
function _trRows_() {
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  var rows = demoOn ? _getDemoFcRegularData() : _getDbFcRegularData();
  return Array.isArray(rows) ? rows : [];
}

// Rows still reachable once `dims` have been chosen. An UNSET upstream dimension matches nothing, which is
// what makes "you cannot pick a marketplace before a country" fall out of the data instead of a rule.
function _trRowsFor_(chosen, dims) {
  return _trRows_().filter(function (r) {
    for (var i = 0; i < dims.length; i++) {
      var d = dims[i], want = _trNorm_(chosen[d]);
      if (!want) return false;
      if (_trNorm_(r[d]) !== want) return false;
    }
    return true;
  });
}

// WHY AN UNREADABLE READ IS NOT AN EMPTY ONE. _trRows_() answers [] for a refused read, an in-flight read
// and an empty table alike. Offering '— no data —' for the first two would tell the user their database is
// empty when the page merely failed to ask it — the same false-empty the Year dropdown carried before R1.
function _trDataState_() {
  var refused = (typeof _fcViewState_ !== 'undefined') && (typeof FC_VIEW_ !== 'undefined')
    && _fcViewState_ === FC_VIEW_.REFUSED;
  if (refused) return 'UNREADABLE';
  var loading = (typeof _fcViewState_ !== 'undefined') && (typeof FC_VIEW_ !== 'undefined')
    && _fcViewState_ === FC_VIEW_.REFRESHING;
  if (!_trRows_().length) return loading ? 'LOADING' : 'EMPTY';
  return 'OK';
}

function _trDistinct_(rows, dim) {
  var seen = {}, out = [];
  for (var i = 0; i < rows.length; i++) {
    var v = _trNorm_(rows[i][dim]);
    if (v && !seen[v]) { seen[v] = 1; out.push(v); }
  }
  if (dim === 'year') return out.sort(function (a, b) { return Number(b) - Number(a); });
  return out.sort();
}

// The DOM is the single source of selection truth — a parallel state object is one more thing that can
// disagree with what the user is looking at.
function _trSel_() {
  var out = {};
  for (var i = 0; i < _TR_ORDER_.length; i++) {
    var el = document.getElementById(_TR_CTL_[_TR_ORDER_[i]]);
    out[_TR_ORDER_[i]] = el ? _trNorm_(el.value) : '';
  }
  var se = document.getElementById('target-scope-input');
  out.scope = _trCanonScope_(se ? se.value : '');
  return out;
}

// CATEGORY is the fallback when no scope is chosen yet — it is the narrowest set of controls, so nothing
// downstream is offered before the operator has said what they are scoping. (The key is UPPERCASE: when
// the vocabulary moved to uppercase, a stale `.Category` fallback silently returned undefined and the
// Category control was never built at all.)
function _trActiveDims_(scope) {
  var fields = _TR_SCOPE_FIELDS_[_trCanonScope_(scope)] || _TR_SCOPE_FIELDS_.CATEGORY;
  return ['year', 'country', 'marketplace'].concat(fields);
}

// Values are canonical; only the visible text may be friendly (§4).
function _trFillSelect_(el, opts, pick, labelFn) {
  while (el.firstChild) el.removeChild(el.firstChild);
  var ph = document.createElement('option');
  ph.value = '';
  ph.textContent = opts.length ? '— select —' : '— no data —';
  el.appendChild(ph);
  for (var i = 0; i < opts.length; i++) {
    var o = document.createElement('option');
    o.value = opts[i];
    o.textContent = labelFn ? labelFn(opts[i]) : opts[i];
    el.appendChild(o);
  }
  el.value = pick || '';
  el.disabled = opts.length === 0;
}

// Rebuild every active list from the canonical rows, carrying forward only values that still exist. This is
// the single place that decides what may be selected, so a downstream value cannot survive an upstream change.
// `seed` carries values that are WANTED but cannot be set on the control yet, because a <select> silently
// refuses a value none of its options offers. Applied here, while each list is being built, it lands.
function _trRebuild_(seed) {
  var sel = _trSel_();
  var active = _trActiveDims_(sel.scope);
  var chosen = {};
  // Defined ONCE, reading chosen.country at call time — country is settled before marketplace is built.
  // A closure created inside the loop would capture the loop's `var` and only be correct for as long as
  // _trFillSelect_ stays synchronous, which is not a property worth depending on.
  function marketplaceLabel(v) { return _fcMarketplaceLabel(v, '', chosen.country); }
  for (var i = 0; i < active.length; i++) {
    var dim = active[i];
    var rows = _trRowsFor_(chosen, active.slice(0, i));
    var opts = _trDistinct_(rows, dim);
    var prev = sel[dim] || (seed && seed[dim] ? _trNorm_(seed[dim]) : '');
    // A value that is still offered is kept; a single option may auto-select; anything else clears.
    var pick = (opts.indexOf(prev) !== -1) ? prev : (opts.length === 1 ? opts[0] : '');
    var el = document.getElementById(_TR_CTL_[dim]);
    if (el) _trFillSelect_(el, opts, pick, dim === 'marketplace' ? marketplaceLabel : null);
    chosen[dim] = pick;
  }
  // Inactive controls are emptied, not merely hidden: a hidden <select> still has a .value, and that value
  // is exactly the "stale hidden field" §5 refuses to dispatch.
  for (var j = 0; j < _TR_ORDER_.length; j++) {
    var d = _TR_ORDER_[j];
    if (active.indexOf(d) !== -1) continue;
    var dead = document.getElementById(_TR_CTL_[d]);
    if (dead) { while (dead.firstChild) dead.removeChild(dead.firstChild); dead.value = ''; }
  }
  // R2B-A2-R5-F5 — the identity may have moved, so decide what rule this is and hydrate BEFORE the
  // gate runs. Placed here rather than in _trOnChange_ because updateTargetScopeFields reaches the
  // rebuild too, and a scope change moves the identity just as surely as a country change does.
  _trSyncSession_();
  _trApplyGate_();
}

function _trOnChange_(dim) {
  // Clear everything downstream of the changed dimension before rebuilding, so a stale value can never be
  // "carried forward" merely because it also happens to exist under the new parent.
  var at = _TR_ORDER_.indexOf(dim);
  if (at !== -1) {
    for (var i = at + 1; i < _TR_ORDER_.length; i++) {
      var el = document.getElementById(_TR_CTL_[_TR_ORDER_[i]]);
      if (el) el.value = '';
    }
  }
  _trRebuild_();
}

// COMPANY IS DERIVED, NEVER CHOSEN (§2). It is resolved from the rows the rule will actually apply to, so a
// rule that would span two owners is refused instead of silently taking the first — a blank company cell is
// a wildcard to resolveTargetPct, and the first-of-two is simply wrong.
function _trCompanyResolution_() {
  var sel = _trSel_();
  var active = _trActiveDims_(sel.scope);
  for (var i = 0; i < active.length; i++) { if (!sel[active[i]]) return { state: 'INCOMPLETE', companies: [] }; }
  var rows = _trRowsFor_(sel, active);
  if (!rows.length) return { state: 'DATA_UNAVAILABLE', companies: [] };
  var comps = _trDistinct_(rows, 'company');
  if (comps.length === 1) return { state: 'RESOLVED', companies: comps, company: comps[0] };
  if (comps.length === 0) return { state: 'DATA_UNAVAILABLE', companies: [] };
  return { state: 'AMBIGUOUS', companies: comps };
}

function _trMonths_() {
  var values = {}, invalid = [];
  for (var i = 0; i < _FC_MONTH_KEYS.length; i++) {
    var m = _FC_MONTH_KEYS[i];
    var el = document.getElementById('target-' + m);
    var raw = el ? String(el.value).trim() : '';
    var n = (raw === '') ? NaN : Number(raw);
    // The old reader was `parseInt(v) || 100`, which turned both a typo AND a deliberate 0 into 100.
    if (!isFinite(n) || n < 0) { invalid.push(m); continue; }
    values[m] = n;
  }
  return { values: values, invalid: invalid };
}

// ==============================================================================================
// R2B-A2-R5-F5 — THE EXISTING RULE. Until this round the modal had no idea one could exist.
//
// Every selector above is built from the FC REGULAR FORECAST universe, which is right for deciding
// what may be selected and says nothing about what has already been WRITTEN. So choosing the
// identity of a rule that exists produced a form full of the new-rule default 100, and saving it
// overwrote real values — Jan 110, Feb 105, October 150 — with defaults the operator never typed.
// The write path was correct throughout: it found the row by business key and updated it, exactly
// as designed. What was missing is that the form never asked whether that row existed.
//
// The authority for that question is the canonical Target Rule array the page already holds. No
// request is issued to open or re-classify the modal.
// ==============================================================================================
var _TR_FP_MONTHS_ = ['jan_pct', 'feb_pct', 'mar_pct', 'apr_pct', 'may_pct', 'jun_pct',
  'jul_pct', 'aug_pct', 'sep_pct', 'oct_pct', 'nov_pct', 'dec_pct'];
// MUST stay identical to FC_TR_FINGERPRINT_FIELDS_ in 14_fc_write_handlers.gs, in this order. The
// two sides compute the same token over the same values, so the server can tell a stale save from a
// current one without either side trusting a clock.
var _TR_FP_FIELDS_ = ['year', 'company', 'country', 'marketplace', 'scope_type', 'scope_id',
  'category', 'series', 'sku', 'target_percentage'].concat(_TR_FP_MONTHS_).concat(['note']);
var _TR_FP_NUMERIC_ = ['year', 'target_percentage'].concat(_TR_FP_MONTHS_);

function _trStrTok_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function _trNumTok_(v) {
  var t = _trStrTok_(v);
  if (t === '') return '';
  var n = Number(t);
  return isFinite(n) ? String(n) : t;
}
/* The row's content fingerprint — the version token. Deliberately NOT updated_at: the server writes
   that at second precision in the script timezone while the page reads it back as ISO UTC, so an
   equality test on it can fail for a rounding or daylight-saving reason. A fingerprint of the values
   asks the question actually being asked — has anyone changed this rule since I read it? */
function _trFingerprint_(o) {
  o = o || {};
  var parts = [];
  for (var i = 0; i < _TR_FP_FIELDS_.length; i++) {
    var f = _TR_FP_FIELDS_[i];
    parts.push(_TR_FP_NUMERIC_.indexOf(f) !== -1 ? _trNumTok_(o[f]) : _trStrTok_(o[f]));
  }
  return parts.join('|');
}
/* year|company|country|marketplace|scope_type|scope_id, uppercased — the same canonical business key
   fcTrBusinessKey_ builds server-side and resolveTargetRule matches on. */
function _trKeyOf_(o) {
  function U(v) { return _trStrTok_(v).toUpperCase(); }
  return [U(o.year), U(o.company), U(o.country), U(o.marketplace), U(o.scope_type), U(o.scope_id)].join('|');
}

/* The edit session. `key` is what the session is FOR: while it does not change, the operator's typing
   is theirs to keep, and a rebuild must not overwrite it. When it changes, the session is over. */
var _trSession_ = { key: '', mode: 'NEW', id: '', version: '', originalFp: '', row: null };

/* R2B-A2-R5-F5-F1 — THE SEAM THIS ROUND EXISTS TO REPAIR.

   A Target Rule exists in this page in THREE shapes, and they are not interchangeable:

     canonical   what the sheet stores and the server sends and receipts back:
                 { target_rule_id, scope_type, scope_id, jan_pct..dec_pct, ... }
     normalized  what normalizeFcTargetRuleRecord produces and the read model holds:
                 { ruleId, scopeType, scopeId, targetPercentage, raw }   <- raw IS the canonical row
     display     what _getDbTargetRules builds for the TABLE:
                 { id, scope, year, ..., percentages }

   Every function in the F5 rehydration set reads CANONICAL field names — _trKeyOf_ wants
   scope_type/scope_id, _trHydrateFrom_ wants jan_pct..dec_pct, _trFingerprint_ wants the whole
   canonical field list. This function used to hand them DISPLAY rows. On a display row scope_type
   and scope_id are undefined, so BOTH production rules keyed to '2026|RESUS|US|AMAZON||', matched
   nothing, and were classified NEW — the modal offering twelve 100s over a rule that already had
   values. The fix belongs HERE, at the boundary, and not in _trKeyOf_: a key builder taught to
   guess across three shapes is a key builder that can no longer say two rules are different.

   THREE RETURN STATES, each with a different meaning, none collapsible into another:
     null                 matching is NOT APPLICABLE (Demo mode). Its mock rows carry a
                          `percentages` object, so fingerprinting them would compare two shapes
                          and call every rule stale. Demo continues to classify as NEW.
     _TR_UNAVAILABLE_     the canonical rows could NOT be read. This is NOT zero rules. An
                          identity cannot be classified, so it must not be called NEW — that is
                          precisely the reading that offers defaults over stored values.
     array (may be empty) the canonical rows, including the legitimate empty case: no rule exists
                          yet, and NEW is the correct and provable answer.

   A row whose .raw is missing fails the WHOLE read rather than being skipped. A silently dropped
   row is how an existing rule becomes a new one. */
var _TR_UNAVAILABLE_ = { targetRuleRowsUnavailable: true };

function _trExistingRules_() {
  if (typeof _fcUseDb === 'function' && !_fcUseDb()) return null;   // Demo: matching not applicable
  var rows = (typeof _fcGetTargetRules === 'function') ? _fcGetTargetRules() : null;
  if (!Array.isArray(rows)) return _TR_UNAVAILABLE_;
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var raw = rows[i] ? rows[i].raw : null;
    if (!raw || typeof raw !== 'object') return _TR_UNAVAILABLE_;
    out.push(raw);
  }
  return out;
}

/* The business key the CURRENT selection would write to. '' until the identity is complete. */
function _trSelKey_(sel, company) {
  var fields = _TR_SCOPE_FIELDS_[sel.scope];
  if (!fields || !company) return '';
  var scopeId = sel[fields[fields.length - 1]];
  if (!sel.year || !sel.country || !sel.marketplace || !scopeId) return '';
  return _trKeyOf_({ year: sel.year, company: company, country: sel.country,
    marketplace: sel.marketplace, scope_type: sel.scope, scope_id: scopeId });
}

/* ZERO matches -> NEW. ONE -> EXISTING_UPDATE. TWO OR MORE -> DUPLICATE_REFUSAL.
   Never the first match, never the last, never a match on Series/SKU alone. */
function _trClassify_(sel, company) {
  var key = _trSelKey_(sel, company);
  if (!key) return { mode: 'INCOMPLETE', key: '', matches: [] };
  var rules = _trExistingRules_();
  // UNAVAILABLE is answered before NEW on purpose. 'I could not read the rules' and 'there are no
  // rules' are different facts, and only the second one licenses a new-rule form.
  if (rules === _TR_UNAVAILABLE_) return { mode: 'DATA_UNAVAILABLE', key: key, matches: [] };
  if (rules === null) return { mode: 'NEW', key: key, matches: [] };   // Demo: matching not applicable
  var matches = rules.filter(function (r) { return _trKeyOf_(r) === key; });
  if (matches.length === 0) return { mode: 'NEW', key: key, matches: [] };
  if (matches.length === 1) return { mode: 'EXISTING_UPDATE', key: key, matches: matches, row: matches[0] };
  return { mode: 'DUPLICATE_REFUSAL', key: key, matches: matches };
}

/* Apply-to-all shows the COMMON value when all twelve agree and BLANK when they differ. It must never
   show 100 for a rule whose months are mixed: that is the reading that invites an operator to press
   Save and flatten eleven real values. */
function _trSetApplyAll_(monthValues) {
  var el = document.getElementById('target-base-pct-input');
  if (!el) return;
  var common = _trCommonMonthlyPct_(monthValues);
  el.value = (common === '') ? '' : String(common);
  el.placeholder = (common === '') ? 'mixed' : '100';
}

/* Populate the twelve month controls from a stored row, BY COLUMN NAME. A stored 0 stays 0 and a
   stored blank stays blank — neither becomes 100. */
function _trHydrateFrom_(row) {
  var vals = {};
  for (var i = 0; i < _FC_MONTH_KEYS.length; i++) {
    var m = _FC_MONTH_KEYS[i];
    var v = row[m + '_pct'];
    var txt = (v === undefined || v === null || v === '') ? '' : String(v);
    var el = document.getElementById('target-' + m);
    if (el) el.value = txt;
    vals[m] = (txt === '') ? '' : Number(txt);
  }
  _trSetApplyAll_(vals);
}

/* Clear the months to BLANK. Used when the rule set could not be read: the form must not show 100,
   because 100 in a month box is a value someone could save, and this state knows nothing. */
function _trBlankMonths_() {
  for (var i = 0; i < _FC_MONTH_KEYS.length; i++) {
    var el = document.getElementById('target-' + _FC_MONTH_KEYS[i]);
    if (el) el.value = '';
  }
  var a = document.getElementById('target-base-pct-input');
  if (a) { a.value = ''; a.placeholder = ''; }
}

/* The new-rule form: the documented 100 default, and an EMPTY apply-to-all (its placeholder says 100,
   which is a suggestion; a value there would be a claim). */
function _trResetToNew_() {
  for (var i = 0; i < _FC_MONTH_KEYS.length; i++) {
    var el = document.getElementById('target-' + _FC_MONTH_KEYS[i]);
    if (el) el.value = 100;
  }
  var a = document.getElementById('target-base-pct-input');
  if (a) { a.value = ''; a.placeholder = '100'; }
}

/* What the form is PROPOSING, fingerprinted the way the server will fingerprint it. Identity comes
   from the stored row (an existing rule's identity is fixed), the months from the controls, and
   target_percentage is derived exactly as the payload derives it. */
function _trProposedFingerprint_(row, monthValues) {
  var o = {};
  for (var i = 0; i < _TR_FP_FIELDS_.length; i++) { o[_TR_FP_FIELDS_[i]] = row[_TR_FP_FIELDS_[i]]; }
  for (var j = 0; j < _FC_MONTH_KEYS.length; j++) {
    o[_FC_MONTH_KEYS[j] + '_pct'] = monthValues[_FC_MONTH_KEYS[j]];
  }
  o.target_percentage = _trCommonMonthlyPct_(monthValues);
  return _trFingerprint_(o);
}

/* Called from _trRebuild_ — i.e. whenever the IDENTITY may have moved, and never on a month keystroke.
   A session survives for as long as its key does, so editing months does not re-hydrate them away. */
function _trSyncSession_() {
  var sel = _trSel_();
  var cr = _trCompanyResolution_();
  var company = (cr.state === 'RESOLVED') ? cr.company : '';
  var cls = _trClassify_(sel, company);
  if (cls.key === _trSession_.key && _trSession_.key !== '') return cls;   // same rule, keep the edits

  _trSession_ = { key: cls.key, mode: cls.mode, id: '', version: '', originalFp: '', row: null };
  if (cls.mode === 'EXISTING_UPDATE') {
    var row = cls.row;
    _trSession_.id = _trStrTok_(row.target_rule_id);
    _trSession_.version = _trFingerprint_(row);
    _trSession_.originalFp = _trSession_.version;
    _trSession_.row = row;
    _trHydrateFrom_(row);
  } else if (cls.mode === 'DATA_UNAVAILABLE') {
    // NOT the new-rule form. The documented 100 defaults are an answer, and this state has none.
    _trBlankMonths_();
  } else {
    // NEW, INCOMPLETE and DUPLICATE_REFUSAL all clear the form. Leaving the previous rule's months
    // on screen after the identity moved is how one rule's values get written onto another.
    _trResetToNew_();
  }
  return cls;
}

/* R2B-A2-R5-F6 — ONE STATUS CARD.

   There used to be two message bars. The scope note said what the gate thought, the mode note said
   what the classifier thought, and for the state that matters most they said the same thing twice:

       Existing rule — Update  ·  no change yet. Edit a month to enable Save.
       Existing rule — Update  ·  fc_target_rules-B56D730F-138

   Two bars for one fact, with a database key as the loudest text in the modal. This renders ONE card:
   a title for what the rule is, a state line for what is true right now, and the identity as quiet
   metadata. Both inputs still come from the same classification and the same gate, so the card and the
   Save button cannot describe two different rules — that property is the reason the two were merged
   rather than one of them deleted.

   It decides NOTHING. Save enablement, classification, hydration and the write payload are untouched;
   this function only reads what they concluded. */
var _TR_STATUS_SCOPE_LABEL_ = { CATEGORY: 'CATEGORY', SERIES: 'SERIES', SKU: 'SKU' };

function _trStatusIdentity_(sel) {
  var fields = _TR_SCOPE_FIELDS_[sel.scope];
  if (!fields) return '';
  return _trNorm_(sel[fields[fields.length - 1]]);
}

function _trRenderStatus_(cls, g) {
  var card = document.getElementById('target-status-card');
  var btn = document.getElementById('target-load-latest-btn');
  if (btn) btn.style.display = 'none';
  if (!card) return;
  var icon = document.getElementById('target-status-icon');
  var title = document.getElementById('target-status-title');
  var state = document.getElementById('target-status-state');
  var meta = document.getElementById('target-status-meta');
  function put(el, t) { if (el) el.textContent = t; }

  var mode = cls ? cls.mode : 'INCOMPLETE';
  var gate = g || null;
  var refused = gate && !gate.ok ? gate : null;

  // An INCOMPLETE selection always has something to say — the gate names the dimension that is
  // missing — so it renders like every other state. There is deliberately no hide-the-card path:
  // the one this function started with could not be reached, because _trApplyGate_ always supplies
  // a gate and an incomplete classification always carries a refusal. A branch that cannot run is a
  // branch a later reader will trust anyway.

  var sel = {};
  try { sel = _trSel_(); } catch (e) { sel = {}; }
  var scope = _TR_STATUS_SCOPE_LABEL_[sel.scope] || '';
  var ident = _trStatusIdentity_(sel);
  var bits = [];
  if (scope) bits.push(scope);
  if (ident) bits.push(ident);

  if (mode === 'EXISTING_UPDATE') {
    // Dirty is a STATE of the loaded rule, not a different rule. The title holds still so the card
    // does not appear to change subject the moment someone types.
    var dirty = !!(gate && gate.ok);
    put(icon, dirty ? '\u270E' : '\u2713');
    put(title, 'Existing rule loaded');
    put(state, refused && refused.code !== 'UNCHANGED' ? refused.text
      : (dirty ? 'Unsaved changes' : 'No changes yet. Edit a monthly value to enable Save.'));
    if (_trSession_.id) bits.push(_trSession_.id);
    put(meta, bits.join('  ·  '));
    card.className = 'fc-target-status is-existing' + (dirty ? ' is-dirty' : '');
    return;
  }
  if (mode === 'DUPLICATE_REFUSAL') {
    put(icon, '\u26A0');
    put(title, 'Duplicate rules for this identity');
    put(state, cls.matches.length + ' saved rules share this identity. Save is disabled until the '
      + 'duplicate is resolved. Nothing will be written.');
    put(meta, bits.concat([cls.matches.map(function (r) { return r.target_rule_id; }).join(', ')]).join('  ·  '));
    card.className = 'fc-target-status is-duplicate';
    return;
  }
  if (mode === 'DATA_UNAVAILABLE') {
    // Deliberately NOT styled like NEW. Looking like a new-rule form is the reading that invites
    // someone to fill it in and save, which is the whole hazard this state exists to prevent.
    put(icon, '\u26A0');
    put(title, 'Saved rules could not be verified');
    put(state, 'Save is disabled and the monthly values are left blank, because this identity cannot '
      + 'be classified as new or existing.');
    put(meta, bits.join('  ·  '));
    card.className = 'fc-target-status is-unavailable';
    return;
  }
  if (mode === 'NEW') {
    put(icon, '\u002B');
    put(title, 'New rule');
    put(state, refused ? refused.text
      : 'No saved rule exists for this selection. Monthly values start at 100%.');
    put(meta, bits.join('  ·  '));
    card.className = 'fc-target-status is-new';
    return;
  }
  // INCOMPLETE, but the gate has something actionable to say.
  put(icon, '\u2139');
  put(title, 'Select a rule scope');
  put(state, refused ? refused.text : '');
  put(meta, bits.join('  ·  '));
  card.className = 'fc-target-status is-incomplete';
}

/* A server outcome shown in the card rather than in a message bar of its own. It overwrites the title
   and state and leaves the metadata standing, because WHICH rule is being edited has not changed —
   only what the server said about it. The next _trApplyGate_ re-renders from the classification. */
function _trStatusMessage_(title, state) {
  var card = document.getElementById('target-status-card');
  if (!card) return;
  card.style.display = '';
  card.className = 'fc-target-status is-duplicate';
  var i = document.getElementById('target-status-icon');
  var t = document.getElementById('target-status-title');
  var st = document.getElementById('target-status-state');
  if (i) i.textContent = '\u26A0';
  if (t) t.textContent = title;
  if (st) st.textContent = state;
}

/* STALE recovery: ONE read, then re-hydrate from what came back. It deliberately does NOT re-apply the
   operator's edits — reapplying them on top of somebody else's change is the silent overwrite this
   whole round exists to prevent. The operator sees the current values and decides again. */
function _trLoadLatest_() {
  var btn = document.getElementById('target-load-latest-btn');
  if (typeof _fcSliceFetch_ !== 'function') return;
  if (btn) btn.disabled = true;
  // The Target Rules alone — about 1.2 KB. This used to re-read all four tables to refresh two rows.
  _fcSliceFetch_(FC_SLICE_.RULES).then(function () {
    _trSession_.key = '';                       // force a fresh classification and re-hydration
    _trRebuild_();                              // which re-renders the card from the fresh rows
    if (typeof renderTargetRulesTable === 'function') renderTargetRulesTable();
  }).catch(function () {
    _trStatusMessage_('Could not reload the canonical data', 'Your entries are unchanged. The saved '
      + 'rule shown here may be out of date.');
  }).then(function () { if (btn) btn.disabled = false; });
}

/* A confirmed server refusal that the operator can act on inside the modal. */
function _trOnRefusal_(res) {
  var code = '';
  try { code = String((res && (res.error || (res.data && res.data.error))) || ''); } catch (e) { code = ''; }
  if (code !== 'STALE_TARGET_RULE_VERSION') return;
  var btn = document.getElementById('target-load-latest-btn');
  _trStatusMessage_('This rule changed after it was loaded',
    'Nothing was written and your entries are still here. Load the latest data, then decide again.');
  if (btn) btn.style.display = '';
}

// One gate, consulted by both the Save button state and the dispatch path, so what the button says and what
// the click does cannot disagree.
function _trGate_() {
  // Before anything about the selection: is there a canonical universe to select FROM at all?
  var state = _trDataState_();
  if (state === 'UNREADABLE') {
    return { ok: false, code: 'DATA_UNREADABLE',
      text: 'DATA_UNREADABLE — the canonical forecast read was refused. This is not an empty database; '
        + 'close this dialog, press Retry, and reopen once the table has loaded.' };
  }
  if (state === 'LOADING') {
    return { ok: false, code: 'DATA_LOADING', text: 'Loading the canonical forecast\u2026' };
  }
  if (state === 'EMPTY') {
    return { ok: false, code: 'DATA_UNAVAILABLE',
      text: 'DATA_UNAVAILABLE — the canonical forecast has no rows, so there is no scope to write against.' };
  }
  var sel = _trSel_();
  if (!sel.scope) return { ok: false, code: 'SCOPE_INVALID', text: 'Choose a scope.' };
  var active = _trActiveDims_(sel.scope);
  for (var i = 0; i < active.length; i++) {
    if (!sel[active[i]]) return { ok: false, code: 'INCOMPLETE', text: 'Select ' + _TR_LABEL_[active[i]] + '.' };
  }
  var rows = _trRowsFor_(sel, active);
  if (!rows.length) {
    return { ok: false, code: 'DATA_UNAVAILABLE', text: 'DATA_UNAVAILABLE — this combination is not in the canonical forecast data.' };
  }
  var cr = _trCompanyResolution_();
  if (cr.state === 'AMBIGUOUS') {
    return { ok: false, code: 'OWNERSHIP_SCOPE_AMBIGUOUS',
      text: 'OWNERSHIP_SCOPE_AMBIGUOUS — this scope spans ' + cr.companies.length + ' companies ('
        + cr.companies.join(', ') + '). One rule cannot record two owners; narrow the scope.' };
  }
  if (cr.state !== 'RESOLVED') {
    return { ok: false, code: 'DATA_UNAVAILABLE', text: 'DATA_UNAVAILABLE — no company owns this selection.' };
  }
  var mo = _trMonths_();
  if (mo.invalid.length) {
    return { ok: false, code: 'MONTH_INVALID',
      text: 'Enter a number of 0 or more for: ' + mo.invalid.join(', ').toUpperCase() + '.' };
  }
  // ---- R2B-A2-R5-F5 — WHICH RULE IS THIS? ------------------------------------------------------
  var cls = _trClassify_(sel, cr.company);
  if (cls.mode === 'DATA_UNAVAILABLE') {
    return { ok: false, code: 'TARGET_RULE_DATA_UNAVAILABLE', mode: cls.mode,
      text: 'TARGET_RULE_DATA_UNAVAILABLE — the canonical Target Rule rows could not be read, so this '
        + 'identity cannot be classified as new or existing. Nothing will be written. Use Check latest '
        + 'data, then reopen.' };
  }
  if (cls.mode === 'DUPLICATE_REFUSAL') {
    return { ok: false, code: 'DUPLICATE_TARGET_RULE_IDENTITY',
      text: 'DUPLICATE_TARGET_RULE_IDENTITY — ' + cls.matches.length + ' rules already share this '
        + 'identity (' + cls.matches.map(function (r) { return r.target_rule_id; }).join(', ')
        + '). Resolve the duplicate before writing.', matches: cls.matches };
  }
  var base = { company: cr.company, sel: sel, active: active, months: mo.values,
    mode: cls.mode, existing: cls.row || null };
  if (cls.mode === 'EXISTING_UPDATE' && _trSession_.row) {
    // UNCHANGED IS NOT A WRITE. The fingerprint is compared, not the raw strings, so '100' and 100
    // are the same value and re-opening a rule without touching it dispatches nothing.
    var proposed = _trProposedFingerprint_(_trSession_.row, mo.values);
    if (proposed === _trSession_.originalFp) {
      return { ok: false, code: 'UNCHANGED', mode: cls.mode,
        text: 'Existing rule — Update  ·  no change yet. Edit a month to enable Save.' };
    }
    base.target_rule_id = _trSession_.id;
    base.expected_row_version = _trSession_.version;
  }
  base.ok = true; base.code = 'OK';
  return base;
}

function _trApplyGate_() {
  var g = _trGate_();
  // The card is driven from the SAME classification the gate used and from the gate itself, so the
  // label, the state line and the button cannot describe two different rules. It is still diagnostic:
  // a throw in rendering may never decide whether Save is enabled.
  try {
    var _sel = _trSel_(), _cr = _trCompanyResolution_();
    _trRenderStatus_(_trClassify_(_sel, _cr.state === 'RESOLVED' ? _cr.company : ''), g);
  } catch (e) { /* the card is diagnostic; it may never block the gate */ }
  if (typeof _fcSetTargetSaveEnabled_ === 'function') _fcSetTargetSaveEnabled_(!!g.ok);
  return g;
}

function openAddTargetRuleModal() {
  // Seed the year from the page's selection. It is handed to the rebuild rather than written onto the
  // control: at this point the control has no options, so an assignment would be discarded.
  var pageYear = document.getElementById('fc-year-select');
  var seed = { year: pageYear ? _trNorm_(pageYear.value) : '' };
  updateTargetScopeFields(seed);      // rebuilds from the CURRENT read model — no request is issued
  showFcModal('fc-add-target-modal');
}

function updateTargetScopeFields(seed) {
  var scope = _trCanonScope_((document.getElementById('target-scope-input') || {}).value);
  // One source for "which fields does this scope use", shared with _trActiveDims_ — the visible controls
  // and the payload fields can then never disagree about what a scope means.
  var fields = _TR_SCOPE_FIELDS_[scope] || _TR_SCOPE_FIELDS_.CATEGORY;
  var show = {
    'target-category-group': fields.indexOf('category') !== -1,
    'target-series-group': fields.indexOf('series') !== -1,
    'target-sku-group': fields.indexOf('sku') !== -1
  };
  Object.keys(show).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = show[id] ? 'block' : 'none';
  });
  _trRebuild_(seed);
}

/* DELIBERATE, NOT DERIVED. Typing into Apply-to-all writes that value into all twelve controls —
   that is what the control is for. Clearing it does NOT reset the months to 100: blank means 'the
   months differ', which is a description of them, not an instruction to flatten them. Before F5 a
   blank here rewrote all twelve to 100, so simply focusing and clearing the field destroyed a rule. */
function fillAllTargetMonths(value) {
  if (value === '' || value == null) { _trApplyGate_(); return; }
  _FC_MONTH_KEYS.forEach(function (m) {
    var el = document.getElementById('target-' + m);
    if (el) el.value = value;
  });
  _trApplyGate_();
}

// The common monthly value when all twelve agree, else '' (blank). Same shape as request-order.js's writer.
function _trCommonMonthlyPct_(months) {
  var first = null;
  for (var i = 0; i < _FC_MONTH_KEYS.length; i++) {
    var v = months[_FC_MONTH_KEYS[i]];
    if (v === undefined || v === null || v === '' || !isFinite(Number(v))) return '';
    var n = Number(v);
    if (first === null) first = n; else if (n !== first) return '';
  }
  return first === null ? '' : first;
}

// The dispatched body. Built once, from the gate's own resolved values, so what was validated is what is sent.
function _trBuildPayload_(g) {
  var fields = _TR_SCOPE_FIELDS_[g.sel.scope];
  var payload = {
    scope_type: g.sel.scope,
    // scope_id = the canonical identity of the scope's OWN dimension. Verified against all three consumers:
    // procurementTargetRuleResolver_ keys bySku/bySeries/byCat on scope_id; resolveTargetPct reads scope_id
    // first and falls back to sku/series/category; _roSaveTargetPct writes item.sku for SKU scope.
    scope_id: g.sel[fields[fields.length - 1]],
    year: parseInt(g.sel.year, 10),
    company: g.company,
    country: g.sel.country,
    marketplace: g.sel.marketplace,
    category: fields.indexOf('category') !== -1 ? g.sel.category : '',
    series: fields.indexOf('series') !== -1 ? g.sel.series : '',
    sku: fields.indexOf('sku') !== -1 ? g.sel.sku : '',
    actor: 'fc-summary'
  };
  _FC_MONTH_KEYS.forEach(function (m) { payload[m + '_pct'] = g.months[m]; });
  // R2B-A2-R5-F2 — target_percentage is an authoring SUMMARY, never runtime authority: the common value
  // when all twelve months agree, BLANK when they differ. It used to be the January alias, and two
  // consumers read it in place of a named month, so a rule with Jan 91 / Mar 93 applied 91% to March.
  payload.target_percentage = _trCommonMonthlyPct_(g.months);
  // R2B-A2-R5-F5 — an UPDATE names the row it is updating and the version it was composed against.
  // A NEW rule carries neither, and the server refuses to apply a version-less body over an existing
  // row, so a stale page cannot silently turn a create into an overwrite.
  if (g.mode === 'EXISTING_UPDATE' && g.target_rule_id) {
    payload.target_rule_id = g.target_rule_id;
    payload.expected_row_version = g.expected_row_version;
  }
  return payload;
}

/* The ONE normalization authority, borrowed rather than reimplemented. The read model is built by
   normalizeFcTargetRuleRecord; a second normalizer here would be a second definition of what a
   Target Rule is, and the two would drift. When the authority is not present the merge declines
   instead of inventing one — the canonical refresh still delivers the row, just not instantly. */
function _trNormalizeCanonical_(raw) {
  if (typeof normalizeFcTargetRuleRecord !== 'function') return null;
  try { return normalizeFcTargetRuleRecord(raw); } catch (e) { return null; }
}

/* Merge one confirmed saved row into the canonical read model. The row came back FROM the sheet, in
   the server's own receipt, after the write was confirmed — which is why this is the only place the
   page writes into _fcReadModel outside a canonical read.

   R2B-A2-R5-F5-F1 — IT WAS COMPARING THE WRONG FIELD. The receipt is CANONICAL (target_rule_id);
   _fcReadModel.fcTargetRules holds NORMALIZED records (ruleId). `list[i].target_rule_id` was
   undefined on every row, so the loop never matched and every confirmed save APPENDED. Two rows
   became three: the original, unchanged and still showing the old value, plus a canonical row that
   _getDbTargetRules then rendered with an empty id and twelve 100s, because a canonical row carries
   no .raw and no .ruleId for it to read. The operator's change looked like it had not applied, and
   a phantom rule appeared beside it.

   So: normalize first, match on the model's OWN identity, and keep the model one single shape. */
function _trMergeReceipt_(row) {
  if (!row || !_trStrTok_(row.target_rule_id)) return false;
  if (typeof _fcReadModel === 'undefined' || !_fcReadModel || !Array.isArray(_fcReadModel.fcTargetRules)) return false;
  var rec = _trNormalizeCanonical_(row);
  if (!rec) return false;
  var id = _trStrTok_(rec.ruleId);
  if (!id) return false;                       // never a blank-id row in the model
  var list = _fcReadModel.fcTargetRules;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && _trStrTok_(list[i].ruleId) === id) { list[i] = rec; return true; }
  }
  list.push(rec);
  return true;
}

function saveNewTargetRule() {
  // A client refusal writes nothing and keeps every input, so the user can correct one field and retry.
  var g = _trApplyGate_();
  if (!g.ok) { alert(g.text); return; }

  if (!_fcUseDb()) {
    targetRules.push({
      id: 'rule-' + Date.now(), scope: g.sel.scope, year: parseInt(g.sel.year, 10),
      company: g.company, country: g.sel.country, marketplace: g.sel.marketplace,
      category: g.sel.category || null, series: g.sel.series || null, sku: g.sel.sku || null,
      percentages: g.months
    });
    renderTargetRulesTable();
    closeFcModal();
    alert('Target rule added successfully');
    return;
  }

  var payload = _trBuildPayload_(g);
  if (!window.KM.DB.upsertFcTargetRule) { alert('Target rule write API not available.'); return; }
  // FC-SUMMARY-R1 — THE ONE CONTROL THAT COULD DUPLICATE. No id is sent for a new rule, so the
  // server appends: a second click created a second identical rule. It is now single-flight, and
  // the server contract is untouched — no target_rule_id is invented here.
  if (!_fcWriteBegin_('targetRule')) return;
  _fcSetTargetSaveBusy_(true);
  var _trOpts = { ctl: 'targetRule', op: 'Target Rule Save', rows: 1, epoch: _fcEpoch_(),
    // The shared settle calls this to hand the control back, and what it hands back is the IDLE
    // state. Whether Save is then clickable is the validation gate's standing answer, not this
    // callback's — which is why it no longer asserts `true` onto a form it has not looked at.
    reenable: function () { _fcSetTargetSaveBusy_(false); },
    // R2B-A2-R5-F5 §5 — CONFIRMED-RECEIPT RECONCILIATION, not an optimistic update. Nothing is shown
    // until the server has confirmed the write, and what is then shown is the row the SERVER read back
    // from the sheet — not the payload that was sent. The full workspace refresh still runs behind it
    // as reconciliation, but the rule no longer waits on a 222 KB read to become visible.
    onSuccess: function (summary, res) {
      var d = (res && res.data) || {};
      // THE ONLY WRITE PATH WHOSE RECEIPT IS A COMPLETE CANONICAL ROW, and the merge goes through the same
      // normalizer the read model is built from. When it succeeds there is nothing left to ask the server,
      // so the reconciliation request is not merely scoped — it does not happen.
      var _merged = !!(d.row && typeof _trMergeReceipt_ === 'function' && _trMergeReceipt_(d.row));
      _fcAfterWriteScoped_({ slice: FC_SLICE_.RULES, merged: _merged }, function () {
        renderTargetRulesTable(); closeFcModal();
        _fcSetTargetSaveBusy_(false);          // the write is over; the next open re-runs the gate
        alert(FC_MSG_.SAVED + ' Target rule '
          + (d.unchanged ? 'unchanged — nothing was written.' : (d.created ? 'created.' : 'updated.')));
      });
    } };
  window.KM.DB.upsertFcTargetRule(payload)
    .then(function (res) {
      var outcome = _fcSettleWrite_(res, _trOpts);
      if (typeof FC_WRITE_ !== 'undefined' && outcome === FC_WRITE_.REFUSAL) _trOnRefusal_(res);
    })
    .catch(function (err) { _fcFailWrite_(err, _trOpts); });
}


// R2B-A2-R5-F2 §3 — THE DEAD EFFECTIVE-FC CHAIN WAS REMOVED HERE.
//
// getEffectiveFcSafe, getEffectiveTargetPct, calculateEffectiveFC and determineRuleSource formed a closed
// island: getEffectiveFcSafe had ZERO callers anywhere in the repository, and it was the only caller of the
// other three. They nonetheless encoded a SIXTH Target Rule contract — company and country ignored, `All`
// honoured for marketplace and category, first match within each tier — which ran nowhere and contradicted
// the one every live consumer now shares. 58_api_v1_fc_summary_workspace.gs already recorded this multiply
// as "debug-only, unwired".
//
// If FC Summary ever needs an effective-FC preview again, it calls KM.core.planningDemand.resolveTargetRule
// like every other consumer. It does not get its own matcher back.
// Render Target Rules Table
function renderTargetRulesTable() {
  const fixedBody = document.getElementById('fc-target-fixed-body');
  const scrollBody = document.getElementById('fc-target-scroll-body');

  // Demo OFF → live fc_target_rules; Demo ON → local mock array. No longer local-only.
  const rules = _getActiveTargetRules();

  if (rules.length === 0) {
    fixedBody.innerHTML = '';
    scrollBody.innerHTML = '<div class="empty-row">No target rules defined</div>';
    return;
  }

  fixedBody.innerHTML = rules.map(rule => `
    <div class="fixed-row">
      <div class="fixed-cell">${rule.scope}</div>
    </div>
  `).join('');

  scrollBody.innerHTML = rules.map(rule => {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return `
      <div class="scroll-row">
        <div class="scroll-cell">${rule.year}</div>
        <div class="scroll-cell">${rule.country || '-'}</div>
        <div class="scroll-cell">${rule.marketplace || '-'}</div>
        <div class="scroll-cell">${rule.category || '-'}</div>
        <div class="scroll-cell">${rule.series || '-'}</div>
        <div class="scroll-cell">${rule.sku || '-'}</div>
        ${months.map(m => `<div class="scroll-cell">${rule.percentages[m]}%</div>`).join('')}
        <div class="scroll-cell">
          <button class="fc-btn fc-btn--cancel" onclick="deleteTargetRule('${rule.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
  
  syncFcScroll('target');
}

function deleteTargetRule(ruleId) {
  if (!confirm('Delete this target rule?')) return;

  // Demo OFF → hard-delete fc_target_rules by id; Demo ON → local splice.
  if (_fcUseDb()) {
    if (!window.KM.DB.deleteFcTargetRule) { alert('Target rule delete API not available.'); return; }
    if (!_fcWriteBegin_('targetRuleDelete')) return;   // FC-SUMMARY-R1: one logical delete per click
    var _tdOpts = { ctl: 'targetRuleDelete', op: 'Target Rule Delete', rows: 1, epoch: _fcEpoch_(),
      onSuccess: function () { _fcAfterWriteScoped_(FC_SLICE_.RULES, function () { renderTargetRulesTable(); }); } };
    window.KM.DB.deleteFcTargetRule({ target_rule_id: ruleId })
      .then(function (res) { _fcSettleWrite_(res, _tdOpts); })
      .catch(function (err) { _fcFailWrite_(err, _tdOpts); });
    return;
  }

  const idx = targetRules.findIndex(r => r.id === ruleId);
  if (idx !== -1) {
    targetRules.splice(idx, 1);
    renderTargetRulesTable();
  }
}

// ========================================
// MODAL UTILITIES
// ========================================

function showFcModal(modalId) {
  document.getElementById('fc-modal-overlay').classList.add('is-open');
  document.getElementById(modalId).classList.add('is-open');
}

function closeFcModal() {
  document.getElementById('fc-modal-overlay').classList.remove('is-open');
  document.querySelectorAll('.fc-modal').forEach(m => m.classList.remove('is-open'));
  // Clear any open in-modal multi-select panels so reopening a modal never restores a stale-open dropdown.
  if (typeof _evtCloseAllMs === 'function') _evtCloseAllMs();
}

// Close modal on overlay click — bound once in _fcSummaryStaticInit() after the
// FC Summary partial is injected (the overlay lives inside the partial markup).


// ========================================
// DATA INTEGRITY & SAFE CALCULATION
// ========================================

// Validate data integrity across all three datasets
function validateDataIntegrity() {
  const issues = [];
  const targetRules = _getActiveTargetRules();   // live DB (Demo OFF) or local mock (Demo ON)

  // Check 1: Target Rules with SKU scope should have matching Base FC
  targetRules.forEach(rule => {
    if (rule.scope === 'SKU' && rule.sku) {
      const exists = fcRegularMock.some(fc => 
        fc.sku === rule.sku && fc.year === rule.year
      );
      if (!exists) {
        issues.push({
          type: 'ORPHAN_TARGET_RULE',
          severity: 'WARNING',
          message: `Target rule for SKU ${rule.sku} (Year ${rule.year}) has no matching Base FC`,
          ruleId: rule.id
        });
      }
    }
  });
  
  // Check 2: Category consistency
  const categories = new Set(fcRegularMock.map(fc => fc.category));
  targetRules.forEach(rule => {
    if (rule.category && rule.category !== 'All' && !categories.has(rule.category)) {
      issues.push({
        type: 'INVALID_CATEGORY',
        severity: 'ERROR',
        message: `Target rule uses unknown category: ${rule.category}`,
        ruleId: rule.id
      });
    }
  });
  
  // Check 3: Series consistency
  const series = new Set(fcRegularMock.map(fc => fc.series));
  targetRules.forEach(rule => {
    if (rule.series && !series.has(rule.series)) {
      issues.push({
        type: 'INVALID_SERIES',
        severity: 'WARNING',
        message: `Target rule uses unknown series: ${rule.series}`,
        ruleId: rule.id
      });
    }
  });
  
  // Check 4: Marketplace consistency
  const marketplaces = new Set(fcRegularMock.map(fc => fc.marketplace));
  targetRules.forEach(rule => {
    if (rule.marketplace && rule.marketplace !== 'All' && !marketplaces.has(rule.marketplace)) {
      issues.push({
        type: 'INVALID_MARKETPLACE',
        severity: 'WARNING',
        message: `Target rule uses unknown marketplace: ${rule.marketplace}`,
        ruleId: rule.id
      });
    }
  });
  
  return issues;
}


// Export data for API sync (future use)
function exportFcDataForSync(year) {
  if (!year) {
    console.error('Year is required for export');
    return null;
  }
  
  return {
    year,
    timestamp: new Date().toISOString(),
    regularForecast: fcRegularMock.filter(item => item.year === year),
    specialEvents: fcEventMock.filter(item => item.year === year),
    targetRules: targetRules.filter(rule => rule.year === year),
    metadata: {
      totalRegularRecords: fcRegularMock.filter(item => item.year === year).length,
      totalEventRecords: fcEventMock.filter(item => item.year === year).length,
      totalRules: targetRules.filter(rule => rule.year === year).length
    }
  };
}

// Console helper for debugging
window.fcDebug = {
  validateIntegrity: validateDataIntegrity,
  // R2-F1 — getEffectiveFc REMOVED. It named getEffectiveFcSafe, the head of the dead four-function
  // chain deleted in cd3fd8f. The function went; this reference did not, and a bare identifier in an
  // object literal is evaluated like any other — so this line threw ReferenceError at load and took the
  // remaining 3,300 lines of the file with it, including the lifecycle.register that draws the page.
  exportData: exportFcDataForSync,
  showData: () => ({
    regular: fcRegularMock,
    events: fcEventMock,
    rules: targetRules
  })
};

console.log('FC Summary Debug Tools Available: window.fcDebug');


// ========================================
// NEW FC UPDATE FUNCTIONALITY
// ========================================

// Global variable to store target year
let fcTargetYear = null;

// Mock Actual Units data (in real app, this would come from sales data)
const actualUnitsData = {}; // Format: { sku: { year: [jan, feb, ...] } }

// Open mode selection modal
function openAddEventModal() {
  // Get current year and set target year to next year
  const currentYear = new Date().getFullYear();
  fcTargetYear = currentYear + 1;
  
  // Show mode selection modal
  showFcModal('fc-mode-select-modal');
}

// Proceed to selected mode
// FC-SUMMARY-R1 — the selection modal STAYS MOUNTED while prerequisites load, so the operator's
// Regular/Special choice and the page scope survive a slow or failed load. Feedback is synchronous;
// the load is single-flight; a failure refuses in place with a Retry instead of re-entering forever.
function proceedToFcMode() {
  var sel = document.querySelector('input[name="fc-mode"]:checked');
  var selectedMode = sel ? sel.value : 'regular';
  _fcClearPrereqRefusal_();

  if (!_fcPrereqNeeded_(selectedMode) && !_fcBaseFcSourceMissing_(selectedMode)) {
    _fcPrereqState_ = FC_PREREQ_.READY; _fcOpenBuilder_(selectedMode); return;
  }

  if (_fcPrereqTransition_) return;   // a transition is already pending: this click adds nothing at all
  _fcPrereqTransition_ = true;

  var epoch = _fcEpoch_();
  _fcSetNextBusy_(true);        // disabled + aria-busy + "Loading…" in the SAME event loop as the click
  // §7 — when the card selection already started this path's load, THIS is the promise it started.
  _fcPrereqAndSources_(selectedMode).then(function () {
    _fcPrereqTransition_ = false;
    if (!_fcOwns_(epoch)) { _fcPrereqState_ = FC_PREREQ_.UNMOUNTED; return; }   // dead page: no DOM
    _fcSetNextBusy_(false);
    _fcOpenBuilder_(selectedMode);                                              // exactly once
  }).catch(function (err) {
    _fcPrereqTransition_ = false;                                              // Retry is possible again
    if (!_fcOwns_(epoch)) { _fcPrereqState_ = FC_PREREQ_.UNMOUNTED; return; }
    _fcSetNextBusy_(false);
    _fcShowPrereqRefusal_(err);   // modal stays open; no loop, no timer, no automatic retry
  });
}

// Open Regular Forecast Builder modal.
function openRegularUpdateModal() {
  // SECONDARY surface: the builder reads marketplace_skus / sku_details from the broad cache. In Workspace mode the
  // primary render never loads it, so lazy-load it here (once) before populating the builder, then re-open.
  // FC-SUMMARY-R1 — prerequisites are the CALLER's responsibility (proceedToFcMode). A missing one
  // refuses visibly and recoverably; it never silently re-enters this opener in a retry loop.
  if (_fcPrereqNeeded_('regular')) { showFcModal('fc-mode-select-modal');
    _fcShowPrereqRefusal_({ code: 'FC_PREREQUISITES_MISSING', message: 'builder data is not loaded' }); return; }
  var now = new Date();
  document.getElementById('regular-target-year').value = fcTargetYear;
  document.getElementById('regular-base-year').value = fcTargetYear - 1;
  var tm = document.getElementById('regular-target-month'); if (tm) tm.value = String(now.getMonth());
  var bm = document.getElementById('regular-base-month'); if (bm) bm.value = String(now.getMonth());
  document.getElementById('regular-update-method').value = 'actual';
  var skuEl = document.getElementById('regular-sku'); if (skuEl) skuEl.value = '';
  var single = document.querySelector('input[name="regular-mode"][value="single"]'); if (single) single.checked = true;
  _populateRegularScopeSelects();
  _regularSwitchMode();
  _regularClearPreview();
  toggleRegularMethodFields();
  showFcModal('fc-regular-update-modal');
}

// Builder Mode (single | batch). Batch = Category/Series bulk over the in-scope SKUs.
function _regularMode() {
  var el = document.querySelector('input[name="regular-mode"]:checked');
  return el ? el.value : 'single';
}
function _regularSwitchMode() {
  var mode = _regularMode();
  var s = document.getElementById('regular-single-scope');
  var b = document.getElementById('regular-batch-scope');
  if (s) s.style.display = mode === 'single' ? '' : 'none';
  if (b) b.style.display = mode === 'batch' ? '' : 'none';
  Array.prototype.slice.call(document.querySelectorAll('#regular-builder-mode .fc-mode-pill')).forEach(function(p){
    var input = p.querySelector('input[type="radio"]');
    p.classList.toggle('is-active', !!(input && input.checked));
  });
  _regularClearPreview();
}

// Scope changed → refresh the scoped SKU datalist and invalidate any built preview (Preview again).
function onRegularScopeChange() { _regularPopulateSkuDatalist(); _regularClearPreview(); }
// Back-compat alias (SKU field still calls this).
function onRegularSkuChange() { onRegularScopeChange(); }

// Resolve a dropdown value (which may be a canonical marketplace key OR a display name) back to the
// canonical marketplace key stored in the DB. Canonical value → itself; a display name → its key.
function _fcResolveMarketplaceKey(value) {
  value = String(value == null ? '' : value).trim();
  if (!value) return '';
  var mkts = _fcGetMarketplaces();   // Workspace (scoped) → read-model; Legacy → getMarketplaces()
  function lo(v){ return String(v == null ? '' : v).trim().toLowerCase(); }
  // Already a canonical key?
  if (mkts.some(function(m){ return lo(m.marketplace) === lo(value); })) return value;
  // A display name → map to its canonical key.
  var byDisplay = mkts.filter(function(m){ return lo(m.marketplaceDisplayName) === lo(value); })[0];
  return byDisplay ? byDisplay.marketplace : value;
}

// Resolve a canonical marketplace key to its display label (marketplace_display_name if present,
// else the key). Prefer a company + country match to disambiguate shared platform names.
function _fcMarketplaceLabel(key, company, country) {
  key = String(key == null ? '' : key).trim();
  if (!key) return '';
  var mkts = _fcGetMarketplaces();   // Workspace (scoped) → read-model; Legacy → getMarketplaces()
  function up(v){ return String(v == null ? '' : v).trim().toUpperCase(); }
  var exact = mkts.filter(function(m){ return up(m.marketplace) === up(key) &&
    (!company || up(m.company) === up(company)) && (!country || up(m.country) === up(country)) &&
    m.marketplaceDisplayName; })[0];
  if (exact) return exact.marketplaceDisplayName;
  var any = mkts.filter(function(m){ return up(m.marketplace) === up(key) && m.marketplaceDisplayName; })[0];
  return any ? any.marketplaceDisplayName : key;
}

// Build marketplace dropdown options: { value: canonical key, label: display name (fallback key) }.
// Deduped by value+label PAIR so distinct display names for the same key are all kept (never
// collapsed on key alone). fc_regular_forecast keys not in the registry appear canonical-only.
function _fcMarketplaceOptions() {
  var mkts = _fcGetMarketplaces();          // Workspace (scoped) → read-model; Legacy → getMarketplaces()
  var fcRows = _fcGetRegularForecast();     // Workspace (scoped) → read-model; Legacy → getFcRegularForecast()
  var out = [], seenPair = {}, seenValue = {};
  function add(value, label) {
    value = String(value == null ? '' : value).trim(); if (!value) return;
    label = String(label == null ? '' : label).trim() || value;
    var k = value + '||' + label;
    if (seenPair[k]) return; seenPair[k] = 1; seenValue[value] = 1;
    out.push({ value: value, label: label });
  }
  mkts.forEach(function(m){ add(m.marketplace, m.marketplaceDisplayName || m.marketplace); });
  fcRows.forEach(function(r){ var v = String(r.marketplace || '').trim(); if (v && !seenValue[v]) add(v, v); });
  out.sort(function(a, b){ return a.label.localeCompare(b.label); });
  if (!out.length) ['Amazon','Walmart','Shopify','Target'].forEach(function(m){ add(m, m); });
  return out;
}

// Prefill the Jan–Dec inputs from the existing fc_regular_forecast row for the selected
// full SITE identity: COMPANY + Country + Marketplace + SKU + Target Year (read-only lookup).
//   - Company is derived from the selected marketplace(site) option (KM Amazon ≠ ResUS Amazon).
//   - No SKU selected  → do NOT touch the month inputs (avoids wiping a partially-typed grid to 0).
//   - Live + cache not loaded yet → disable Save, show "loading" helper, do not overwrite.
//   - Match found      → fill each month; a blank/empty stored month stays blank (never forced 0).
//   - No match         → reset ALL months to 0 (never fall back to a different company's row).
function _regularPrefillManual() {
  var months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  var sku = ((document.getElementById('regular-sku') || {}).value || '').trim();
  var site = _regularSelectedSite();
  var company = site.company, country = site.country, marketplace = site.marketplace;
  var year = parseInt(document.getElementById('regular-target-year').value);
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }

  // Loading guard: in live mode, if the forecast is not loaded yet, do NOT prefill (would read an
  // empty set and could mislead). Disable Save until it is ready.
  //
  // R2-STABILITY §2 — it asks the PAGE, not `window._opDbCache`. That flag belongs to the broad
  // cache, which in Workspace mode is never filled and never read; guarding on it meant the grid
  // could be blocked while the rows were on screen behind the modal, and unblocked by a read whose
  // result this function does not consult.
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  if (!demoOn && !_fcRegularSourceReady_()) {
    _setRegularSaveEnabled(false);
    _setRegularManualHelp('Loading existing forecast… please wait.', '#b45309');
    return;
  }

  if (!sku) {
    _setRegularSaveEnabled(true);
    _setRegularManualHelp('Enter a SKU to load its existing monthly forecast.', '#64748B');
    return;
  }

  // Match by the FULL site identity (company + country + marketplace + sku + year). Company MUST
  // match — KM / US / Amazon never loads ResUS / US / Amazon (and vice-versa).
  var demoSrc = demoOn ? (fcRegularMock || []).map(function(r){ return { company: r.company, country: r.country, marketplace: r.marketplace, sku: r.sku, year: r.year,
    jan: r.months && r.months[0], feb: r.months && r.months[1], mar: r.months && r.months[2], apr: r.months && r.months[3],
    may: r.months && r.months[4], jun: r.months && r.months[5], jul: r.months && r.months[6], aug: r.months && r.months[7],
    sep: r.months && r.months[8], oct: r.months && r.months[9], nov: r.months && r.months[10], dec: r.months && r.months[11] }; }) : null;
  // R2-STABILITY §2 — the page's one Regular-forecast owner. In Workspace mode this is the read
  // model the table behind the modal is drawn from; in Legacy it is the broad cache, exactly as before.
  var rows = demoSrc || _fcGetRegularForecast();
  var match = rows.filter(function(r){
    return up(r.sku) === up(sku) && String(r.year) === String(year) &&
      up(r.company) === up(company) &&
      up(r.country) === up(country) &&
      lo(r.marketplace) === lo(marketplace);
  })[0];

  if (match) {
    months.forEach(function(m){
      var el = document.getElementById('reg-' + m); if (!el) return;
      var raw = match[m];
      // Blank/empty stored month → keep the field blank (do NOT force 0). Otherwise show the value.
      el.value = (raw === '' || raw === null || raw === undefined) ? '' : (Math.round(Number(raw)) || 0);
    });
    _setRegularManualHelp('Existing forecast loaded for ' + sku + ' (' + (company || '—') + ' / ' + (country || '—') + ' / ' +
      _fcMarketplaceLabel(marketplace, company, country) + ', ' + year + '). Editing will update this row.', '#0f766e');
  } else {
    // No existing row for this SKU + Country + Marketplace + Year → reset EVERY month to 0.
    // (Must NOT retain the previously-loaded marketplace's values, e.g. switching US Amazon → eBay.)
    months.forEach(function(m){ var el = document.getElementById('reg-' + m); if (el) el.value = 0; });
    _setRegularManualHelp('No existing FC found for this Marketplace. Saving will create a new forecast row.', '#b45309');
  }
  _setRegularSaveEnabled(true);
}

// Enable/disable the Regular modal Save button (used during prefill loading).
function _setRegularSaveEnabled(on) {
  var btn = document.getElementById('regular-save-btn');
  if (btn) { btn.disabled = !on; btn.style.opacity = on ? '' : '0.5'; btn.style.pointerEvents = on ? '' : 'none'; }
}

// Set the Manual-mode helper text (created new / loaded existing / loading).
function _setRegularManualHelp(msg, color) {
  var el = document.getElementById('regular-manual-help');
  if (el) { el.textContent = msg || ''; el.style.color = color || '#64748B'; el.style.display = msg ? '' : 'none'; }
}

// Populate Country / Marketplace selects from live marketplaces (Demo OFF) or fc_regular_forecast /
// static fallback. NO Company select — company is derived from marketplaces / marketplace_skus.
function _populateRegularScopeSelects() {
  // Demo ON → demo dataset only; Demo OFF (live) → live sources only (never mix demo into live,
  // which previously produced duplicate marketplaces e.g. two "Amazon").
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  var mkts = demoOn ? [] : _fcGetMarketplaces();   // §14.4 — the page's one marketplaces owner
  var fcRows = demoOn ? [] : _fcGetRegularForecast();   // §2 — and the page's one forecast owner
  function distinct(arr) { var o = [], s = {}; arr.forEach(function(v){ v = String(v||'').trim(); if (v && !s[v]) { s[v]=1; o.push(v); } }); return o.sort(); }
  var srcCountries = demoOn
    ? (fcRegularMock || []).map(function(r){ return r.country; })
    : mkts.map(function(m){return m.country;}).concat(fcRows.map(function(r){return r.country;}));
  var countries = distinct(srcCountries);
  if (!countries.length) countries = ['US', 'UK', 'DE', 'CA', 'JP', 'AU'];

  var filters = (typeof getFcFilters === 'function') ? getFcFilters() : { countries: [], marketplaces: [] };
  var defCountry = (filters.countries && filters.countries.length === 1) ? filters.countries[0] : (countries[0] || '');

  var cSel = document.getElementById('regular-country');
  if (cSel) cSel.innerHTML = countries.map(function(c){ return '<option value="' + c + '"' + (c === defCountry ? ' selected' : '') + '>' + c + '</option>'; }).join('');
  // Marketplace select carries the full SITE identity (company|country|marketplace) — see below.
  _regularRebuildSites();
  // Category / Series MULTI-selects (batch mode) from sku_details distinct values (All = none checked).
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  _regularFillMsOptions('category', distinct(details.map(function(d){ return d.category; })));
  _regularFillMsOptions('series', distinct(details.map(function(d){ return d.series; })));
  _regularBindMsGlobalClose();
  _regularCloseAllMs();
  _regularPopulateSkuDatalist();
}

// ---- Regular FC in-modal multiselect (Category / Series) — mirrors the Special Event pattern ----
function _regularFillMsOptions(which, values) {
  var box = document.getElementById('regular-' + which + '-options');
  if (box) box.innerHTML = values.map(function(v){
    var safe = String(v).replace(/"/g, '&quot;');
    return '<label class="fc-ms-item"><input type="checkbox" value="' + safe + '" onchange="_regularMsChanged(\'' + which + '\')"><span>' + v + '</span></label>';
  }).join('');
  var allCb = document.getElementById('regular-' + which + '-all'); if (allCb) allCb.checked = true;
  var panel = document.getElementById('regular-' + which + '-panel'); if (panel) panel.style.display = 'none';
  _regularMsUpdateText(which);
}
function _regularToggleMsPanel(which) {
  if (window.event) { try { window.event.stopPropagation(); } catch (e) {} }
  var panel = document.getElementById('regular-' + which + '-panel');
  if (!panel) return;
  var show = (panel.style.display === 'none' || !panel.style.display);
  ['category','series'].forEach(function(w){ var p = document.getElementById('regular-' + w + '-panel'); if (p) p.style.display = 'none'; });
  panel.style.display = show ? '' : 'none';
}
function _regularCloseAllMs() {
  ['category','series'].forEach(function(w){ var p = document.getElementById('regular-' + w + '-panel'); if (p) p.style.display = 'none'; });
}
var _regularMsGlobalBound = false;
function _regularBindMsGlobalClose() {
  if (_regularMsGlobalBound) return;
  document.addEventListener('click', function(e) {
    var modal = document.getElementById('fc-regular-update-modal');
    if (!modal || !modal.classList.contains('is-open')) return;
    if (e.target && e.target.closest && e.target.closest('#fc-regular-update-modal .fc-ms')) return;
    _regularCloseAllMs();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var modal = document.getElementById('fc-regular-update-modal');
    if (!modal || !modal.classList.contains('is-open')) return;
    _regularCloseAllMs();
  });
  _regularMsGlobalBound = true;
}
function _regularMsAll(which, cb) {
  if (cb.checked) {
    Array.prototype.slice.call(document.querySelectorAll('#regular-' + which + '-options input[type="checkbox"]'))
      .forEach(function(o){ o.checked = false; });
  }
  _regularMsSyncAll(which);
}
function _regularMsChanged(which) { _regularMsSyncAll(which); }
function _regularMsSyncAll(which) {
  var opts = Array.prototype.slice.call(document.querySelectorAll('#regular-' + which + '-options input[type="checkbox"]'));
  var anyChecked = opts.some(function(o){ return o.checked; });
  var allCb = document.getElementById('regular-' + which + '-all');
  if (allCb) allCb.checked = !anyChecked;
  _regularMsUpdateText(which);
  if (which === 'category') _regularRebuildSeriesOptions();   // Series depends on selected Category
  _regularClearPreview();   // scope changed → must Preview again before Save
}
// Series options for the selected categories (null = All → every series). Deduped + sorted, derived
// from sku_details (never hard-coded). Shared by the Regular and Special Event builders.
function _fcSeriesForCategories(selectedCats) {
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  var set = {};
  details.forEach(function(d){
    var c = String(d.category || '').trim();
    if (!selectedCats || selectedCats.indexOf(c) >= 0) { var s = String(d.series || '').trim(); if (s) set[s] = 1; }
  });
  return Object.keys(set).sort();
}
// Rebuild the Regular Series options constrained to the selected Category(ies); preserve still-valid
// checked series, drop the rest (so an out-of-category Series can never survive into Preview/Save).
function _regularRebuildSeriesOptions() {
  var box = document.getElementById('regular-series-options');
  if (!box) return;
  var prevSel = _regularMsValues('series');   // null = All, or array of series
  var valid = _fcSeriesForCategories(_regularMsValues('category'));
  box.innerHTML = valid.map(function(v){
    var safe = String(v).replace(/"/g, '&quot;');
    var checked = (prevSel && prevSel.indexOf(v) >= 0) ? ' checked' : '';
    return '<label class="fc-ms-item"><input type="checkbox" value="' + safe + '"' + checked + ' onchange="_regularMsChanged(\'series\')"><span>' + v + '</span></label>';
  }).join('');
  var anyChecked = Array.prototype.slice.call(box.querySelectorAll('input[type="checkbox"]')).some(function(o){ return o.checked; });
  var allCb = document.getElementById('regular-series-all'); if (allCb) allCb.checked = !anyChecked;
  _regularMsUpdateText('series');
}
function _regularMsValues(which) {
  var allCb = document.getElementById('regular-' + which + '-all');
  var opts = Array.prototype.slice.call(document.querySelectorAll('#regular-' + which + '-options input[type="checkbox"]:checked'));
  if ((allCb && allCb.checked) || !opts.length) return null;   // null = All
  return opts.map(function(o){ return o.value; });
}
function _regularMsUpdateText(which) {
  var label = which === 'category' ? 'Category' : 'Series';
  var vals = _regularMsValues(which);
  var el = document.getElementById('regular-' + which + '-text');
  if (!el) return;
  if (!vals) el.textContent = 'All ' + label;
  else if (vals.length <= 2) el.textContent = vals.join(', ');
  else el.textContent = vals.length + ' ' + label + ' selected';
}
// Scoped SKU datalist for the Single-SKU searchable input (company + country + marketplace).
function _regularPopulateSkuDatalist() {
  var list = document.getElementById('regular-sku-datalist');
  if (!list) return;
  var site = _regularSelectedSite();
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var mskus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
  var seen = {}, opts = [];
  mskus.forEach(function(m){
    if (site.company && up(m.company) !== up(site.company)) return;
    if (site.country && up(m.country) !== up(site.country)) return;
    if (mkey && lo(m.marketplace) !== lo(mkey)) return;
    var s = String(m.sku || '').trim();
    if (s && !seen[s]) { seen[s] = 1; opts.push(s); }
  });
  opts.sort();
  list.innerHTML = opts.map(function(s){ return '<option value="' + String(s).replace(/"/g, '&quot;') + '"></option>'; }).join('');
}

// Distinct forecast SITES (company + country + marketplace) for a country, for the Regular modal's
// Marketplace select. value = "company|country|marketplace" (full site identity, so KM Amazon and
// ResUS Amazon are DISTINCT options); label = display name, disambiguated by company when a
// country+marketplace maps to more than one company. Sources: marketplaces registry + live
// fc_regular_forecast + demo fcRegularMock.
function _fcRegularSiteOptions(country) {
  // Demo ON → demo dataset only; Demo OFF (live) → live registry + live fc_regular_forecast only.
  // (Mixing the demo dataset into live is what produced duplicate marketplaces like two "Amazon".)
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  var mkts = demoOn ? [] : _fcGetMarketplaces();   // §14.4 — the page's one marketplaces owner
  var fcRows = demoOn ? [] : _fcGetRegularForecast();   // §2 — and the page's one forecast owner
  function tr(v){ return String(v==null?'':v).trim(); }
  function up(v){ return tr(v).toUpperCase(); }
  var map = {};
  function add(company, ctry, mkt, display) {
    company = tr(company); ctry = tr(ctry); mkt = tr(mkt);
    if (!company || !ctry || !mkt) return;
    if (country && up(ctry) !== up(country)) return;
    // Case-insensitive identity key so the SAME site from different sources (registry vs
    // fc_regular_forecast) never becomes two options; the option value keeps the original casing.
    var key = up(company) + '|' + up(ctry) + '|' + up(mkt);
    if (!map[key]) map[key] = { value: company + '|' + ctry + '|' + mkt, company: company, country: ctry, marketplace: mkt, display: tr(display) };
    else if (!map[key].display && display) map[key].display = tr(display);
  }
  if (demoOn) {
    (fcRegularMock || []).forEach(function(r){ add(r.company, r.country, r.marketplace, _fcMarketplaceLabel(r.marketplace, r.company, r.country)); });
  } else {
    mkts.forEach(function(m){ add(m.company, m.country, m.marketplace, m.marketplaceDisplayName || m.marketplace); });
    fcRows.forEach(function(r){ add(r.company, r.country, r.marketplace, _fcMarketplaceLabel(r.marketplace, r.company, r.country)); });
  }
  var list = Object.keys(map).map(function(k){ return map[k]; });
  // Visible label = marketplace_display_name only (fallback to marketplace). Company is NOT appended
  // — the internal identity (value = company|country|marketplace) still keeps KM Amazon vs ResUS
  // Amazon strictly separated; only the displayed text is the clean display name.
  list.forEach(function(s){ s.label = s.display || s.marketplace; });
  list.sort(function(a,b){ return a.label.localeCompare(b.label) || a.company.localeCompare(b.company); });
  return list;
}

// Rebuild the Marketplace(site) options for the currently-selected country; preserve the selection
// if still valid. Called on open and whenever Country changes.
function _regularRebuildSites() {
  var cSel = document.getElementById('regular-country');
  var mSel = document.getElementById('regular-marketplace');
  if (!mSel) return;
  var country = cSel ? cSel.value : '';
  var prev = mSel.value;
  var sites = _fcRegularSiteOptions(country);
  mSel.innerHTML = sites.map(function(s){ return '<option value="' + s.value + '">' + s.label + '</option>'; }).join('');
  if (prev && sites.some(function(s){ return s.value === prev; })) mSel.value = prev;
}

// Resolve the selected Regular modal site → { company, country, marketplace } (full identity).
// Marketplace value is "company|country|marketplace"; legacy/blank falls back to canonical marketplace.
function _regularSelectedSite() {
  var v = String((document.getElementById('regular-marketplace') || {}).value || '');
  var parts = v.split('|');
  if (parts.length === 3) return { company: parts[0], country: parts[1], marketplace: parts[2] };
  var country = (document.getElementById('regular-country') || {}).value || '';
  return { company: '', country: country, marketplace: _fcResolveMarketplaceKey(v) };
}

// Country changed → rebuild the site (Marketplace) options for that country, then re-prefill.
function onRegularCountryChange() {
  _regularRebuildSites();
  onRegularScopeChange();
}

// Toggle fields based on selected method (Part 3 conditional UI).
//   actual    → Country/Marketplace/Target Year/Base Year/Growth Rate   (hide Month + Jan–Dec)
//   prevMonth → Country/Marketplace/Target Year/Month/Growth Rate        (hide Base Year + Jan–Dec)
//   manual    → Country/Marketplace/Target Year/Jan–Dec                  (hide Base Year + Growth + Month)
function toggleRegularMethodFields() {
  const method = document.getElementById('regular-update-method').value;
  const baseRow = document.getElementById('regular-base-row');
  const basedRow = document.getElementById('regular-based-row');
  const growthGroup = document.getElementById('regular-growth-group');
  const methodDesc = document.getElementById('method-description');
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }

  if (method === 'actual') {
    show(baseRow, true); show(basedRow, false); show(growthGroup, true);
    methodDesc.innerHTML = '<strong>Apply Growth Rate:</strong> take each in-scope SKU’s existing forecast for the <em>Base Year + Base Month</em>, apply the Growth Rate, and write the result into the <em>Target Year + Target Month</em>. Only that one month is updated.';
  } else if (method === 'prevMonth') {
    show(baseRow, false); show(basedRow, true); show(growthGroup, true);
    _regularSyncBasedFromTarget();   // default Based Year/Month = the month before Target (editable)
    methodDesc.innerHTML = '<strong>Adjust From Previous Month Forecast:</strong> take each SKU’s forecast for the explicit <em>Based Year + Based Month</em> (default = the month before Target), apply the rate, and write it into the <em>Target Month</em>. The source is never silently inferred.';
  } else { // manual
    show(baseRow, false); show(basedRow, false); show(growthGroup, false);
    methodDesc.innerHTML = '<strong>Manual Entry:</strong> Preview lists every in-scope SKU with an editable New value for the Target Month. <strong>Blank = Skip</strong> (row not written); enter <strong>0</strong> to set an explicit zero.';
  }
  _regularClearPreview();
}

// Default the Based Year / Based Month to the month immediately before the selected Target Month
// (Target Jan → previous-year Dec). Only sets defaults; the user may override either field.
function _regularSyncBasedFromTarget() {
  var basedYearEl = document.getElementById('regular-based-year');
  var basedMonthEl = document.getElementById('regular-based-month');
  var targetMonthEl = document.getElementById('regular-target-month');
  if (!basedYearEl || !basedMonthEl || !targetMonthEl) return;
  var targetYear = parseInt(document.getElementById('regular-target-year').value) || (new Date()).getFullYear();
  var tm = parseInt(targetMonthEl.value || '0');
  var basedMonth = tm > 0 ? tm - 1 : 11;
  var basedYear = tm > 0 ? targetYear : targetYear - 1;
  basedMonthEl.value = String(basedMonth);
  basedYearEl.value = basedYear;
}

// ===== Regular Forecast Builder — preview + bulk single-month save =====
var REG_MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
var _regularPreview = null;   // { targetYear, targetMonth, method, rows:[...] }

function _regularClearPreview() {
  _regularPreview = null;
  var box = document.getElementById('regular-preview'); if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  var cnt = document.getElementById('regular-affected-count'); if (cnt) cnt.textContent = '';
  _setRegularSaveEnabled(false);
  _setRegularManualHelp('', '');
}

// fc_regular_forecast rows (Demo → in-memory mock mapped to the same shape; DB → live).
function _regularFcRows() {
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  if (demoOn) {
    return (fcRegularMock || []).map(function(r){
      var o = { company: r.company, country: r.country, marketplace: r.marketplace, sku: r.sku, year: r.year, raw: {} };
      REG_MONTH_KEYS.forEach(function(m, i){ o[m] = (r.months && r.months[i] != null) ? r.months[i] : 0; o.raw[m] = o[m]; });
      return o;
    });
  }
  return _fcGetRegularForecast();   // §2 — the page's one Regular-forecast owner
}

// Find the fc row for a full site identity + SKU + year (case-insensitive).
function _regularFindFc(rows, company, country, marketplace, sku, year) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  return rows.filter(function(r){
    return up(r.sku) === up(sku) && String(r.year) === String(year) &&
      up(r.company) === up(company) && up(r.country) === up(country) && lo(r.marketplace) === lo(marketplace);
  })[0] || null;
}

// Existing 12-month values (raw where available so a blank stays blank on write). Missing row → all blank.
function _regularExistingMonths(row) {
  var out = {};
  REG_MONTH_KEYS.forEach(function(m){
    if (!row) { out[m] = ''; return; }
    var raw = row.raw ? row.raw[m] : undefined;
    out[m] = (raw === undefined || raw === null) ? (row[m] != null ? row[m] : '') : raw;
  });
  return out;
}

// In-scope SKUs for the Regular Builder. Single → the typed SKU; Batch → marketplace_skus for the
// site scope joined to sku_details, filtered by the selected Category / Series ('' = All).
function _regularCandidateSkus(site) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  var detBySku = {}; details.forEach(function(d){ detBySku[up(d.sku)] = d; });
  if (_regularMode() === 'single') {
    var sku = ((document.getElementById('regular-sku') || {}).value || '').trim();
    if (!sku) return [];
    var d = detBySku[up(sku)] || {};
    return [{ sku: sku, category: d.category || '', series: d.series || '', company: site.company }];
  }
  var cats = _regularMsValues('category');   // null = All Category
  var series = _regularMsValues('series');   // null = All Series
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var mskus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
  var seen = {}, out = [];
  mskus.filter(function(m){
    return (!site.country || up(m.country) === up(site.country)) && (!mkey || lo(m.marketplace) === lo(mkey)) &&
      (!site.company || up(m.company) === up(site.company));
  }).forEach(function(m){
    var d = detBySku[up(m.sku)] || {};
    if (cats && cats.indexOf(d.category || '') < 0) return;
    if (series && series.indexOf(d.series || '') < 0) return;
    var k = up(m.sku); if (seen[k]) return; seen[k] = 1;
    out.push({ sku: m.sku, category: d.category || '', series: d.series || '', company: m.company || site.company });
  });
  return out;
}

// Build the Preview (affected SKUs, Old → New → Difference for the single Target Month).
function _regularBuildPreview() {
  _regularCloseAllMs();   // Preview closes the multiselect panels
  var site = _regularSelectedSite();
  var company = site.company, country = site.country, marketplace = site.marketplace;
  var targetYear = parseInt(document.getElementById('regular-target-year').value);
  var targetMonth = parseInt((document.getElementById('regular-target-month') || {}).value || '0');
  var method = document.getElementById('regular-update-method').value;
  var rate = parseFloat((document.getElementById('regular-growth-rate') || {}).value) || 0;

  if (!country || !marketplace) { _setRegularManualHelp('Country and Marketplace are required.', '#b45309'); return; }
  if (isNaN(targetYear)) { _setRegularManualHelp('Target Year is required.', '#b45309'); return; }
  if (isNaN(targetMonth)) { _setRegularManualHelp('Target Month is required.', '#b45309'); return; }

  var candidates = _regularCandidateSkus(site);
  if (!candidates.length) {
    _setRegularManualHelp(_regularMode() === 'single' ? 'Enter a SKU to preview.' : 'No SKUs match the selected Category / Series in this scope.', '#b45309');
    _regularClearPreview(); return;
  }

  var rows = _regularFcRows();
  var baseYear, baseMonth;
  if (method === 'actual') { baseYear = parseInt(document.getElementById('regular-base-year').value); baseMonth = parseInt((document.getElementById('regular-base-month') || {}).value || '0'); }
  else if (method === 'prevMonth') { baseYear = parseInt((document.getElementById('regular-based-year') || {}).value); baseMonth = parseInt((document.getElementById('regular-based-month') || {}).value || '0'); }

  var previewRows = candidates.map(function(c){
    var targetRow = _regularFindFc(rows, company, country, marketplace, c.sku, targetYear);
    var existing = _regularExistingMonths(targetRow);
    var oldRaw = existing[REG_MONTH_KEYS[targetMonth]];
    var oldQty = (oldRaw === '' || oldRaw == null) ? null : (Math.round(Number(oldRaw)) || 0);
    var newQty = null;
    if (method === 'actual' || method === 'prevMonth') {
      var baseRow = _regularFindFc(rows, company, country, marketplace, c.sku, baseYear);
      var baseVal = baseRow ? (Number(baseRow[REG_MONTH_KEYS[baseMonth]]) || 0) : 0;
      newQty = Math.max(0, Math.round(baseVal * (1 + rate / 100)));
    } // manual → newQty stays null (user types it in the preview)
    return { sku: c.sku, company: c.company || company, country: country, marketplace: marketplace,
      category: c.category, series: c.series, existing: existing, oldQty: oldQty, newQty: newQty };
  });

  _regularPreview = { targetYear: targetYear, targetMonth: targetMonth, method: method, rows: previewRows };
  _regularRenderPreview();
  _setRegularSaveEnabled(true);
}

function _regularRenderPreview() {
  var box = document.getElementById('regular-preview');
  var cnt = document.getElementById('regular-affected-count');
  if (!box || !_regularPreview) return;
  var monthLbl = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][_regularPreview.targetMonth];
  var manual = _regularPreview.method === 'manual';
  var affected = 0;
  var body = _regularPreview.rows.map(function(r, i){
    var oldDisp = (r.oldQty == null) ? '—' : r.oldQty.toLocaleString();
    var newCell, diffCell;
    if (manual) {
      newCell = '<input type="number" min="0" class="reg-prev-new" data-idx="' + i + '" value="' + (r.newQty == null ? '' : r.newQty) + '" placeholder="Skip" style="width:90px;" oninput="_regularOnManualInput()">';
      diffCell = '<span class="reg-prev-diff" data-idx="' + i + '"></span>';
    } else {
      var diff = (r.newQty || 0) - (r.oldQty || 0);
      if (diff !== 0) affected++;
      var sign = diff > 0 ? '+' : ''; var color = diff > 0 ? '#0f766e' : (diff < 0 ? '#dc2626' : '#64748b');
      newCell = (r.newQty == null ? '—' : r.newQty.toLocaleString());
      diffCell = '<span style="color:' + color + '">' + sign + diff.toLocaleString() + '</span>';
    }
    return '<tr><td>' + _fmvEscapeHtml(r.sku) + '</td><td>' + _fmvEscapeHtml((r.category || '—') + ' / ' + (r.series || '—')) +
      '</td><td>' + oldDisp + '</td><td>' + newCell + '</td><td>' + diffCell + '</td></tr>';
  }).join('');
  box.innerHTML = '<table class="fc-assist-preview-table"><thead><tr><th>SKU</th><th>Category / Series</th>' +
    '<th>Current Forecast (' + monthLbl + ' ' + _regularPreview.targetYear + ')</th><th>New Forecast</th><th>Change</th></tr></thead><tbody>' +
    body + '</tbody></table>';
  box.style.display = '';
  if (cnt) {
    if (manual) { _regularOnManualInput(); }
    else { cnt.textContent = affected + ' of ' + _regularPreview.rows.length + ' SKU(s) will change'; }
  }
}

// Manual mode: recompute per-row diff + affected count live as the user types (blank = Skip).
function _regularOnManualInput() {
  if (!_regularPreview) return;
  var box = document.getElementById('regular-preview'); if (!box) return;
  var affected = 0;
  box.querySelectorAll('.reg-prev-new').forEach(function(inp){
    var idx = parseInt(inp.dataset.idx, 10);
    var r = _regularPreview.rows[idx]; if (!r) return;
    var raw = String(inp.value).trim();
    var diffEl = box.querySelector('.reg-prev-diff[data-idx="' + idx + '"]');
    if (raw === '') { if (diffEl) { diffEl.textContent = 'Skip'; diffEl.style.color = '#94a3b8'; } return; }
    var nv = Math.max(0, Math.round(Number(raw) || 0));
    var diff = nv - (r.oldQty || 0);
    if (diff !== 0 || r.oldQty == null) affected++;
    if (diffEl) { var sign = diff > 0 ? '+' : ''; diffEl.textContent = sign + diff.toLocaleString();
      diffEl.style.color = diff > 0 ? '#0f766e' : (diff < 0 ? '#dc2626' : '#64748b'); }
  });
  var cnt = document.getElementById('regular-affected-count');
  if (cnt) cnt.textContent = affected + ' of ' + _regularPreview.rows.length + ' SKU(s) will be written';
}

// ==============================================================================================
// FC-SUMMARY-R2B-A3-R1 §2 — AN EXISTING EVENT IS AN EXISTING RECORD, NOT A BLANK FORM.
//
// openEventModal cleared every field on every open. There was no path in this builder that could
// load a persisted event, so an operator revisiting BFCM 2027 saw an empty form, retyped what they
// remembered, and saved — and because the old campaign key was company|country|marketplace|NAME|year,
// that save landed on the row they thought they were creating. Blank fields overwrote real ones and
// the response said "Saved successfully".
//
// THE SELECTOR IS OVER CAMPAIGNS, NOT NAMES. One campaign_id is one event window, so two BFCM windows
// in 2027 are two entries and stay two entries even though they share a label — which is scenario B
// and scenario C of the round, and neither is expressible in a list keyed by name. The label shown
// carries the window precisely so the operator can tell them apart.
//
// UNAVAILABLE IS NOT EMPTY. If the event rows cannot be read, the selector says so and offers nothing.
// An empty picker would read as "there are no existing events", which is the sentence that licenses
// creating a duplicate.
// ==============================================================================================

/* The edit session. Null = composing a NEW event, which is the default and the only state that may
   send a versionless save. When it is set, every id in it is carried through the save unchanged. */
var _evtEditing_ = null;

function _evtEditingActive_() { return !!(_evtEditing_ && _evtEditing_.campaignId); }

/* The event rows the BUILDER may reason about. The workspace read model first; otherwise the tables
   the Special Event path's prerequisites loaded. `null` means unavailable and never means none. */
function _evtBuilderEventRows_() {
  if (typeof _fcHas_ === 'function' && _fcHas_('fcSpecialEvents')) return _fcReadModel.fcSpecialEvents;
  if (!_fcPrereqLoadedPaths_ || !_fcPrereqLoadedPaths_.event) return null;
  var DB = window.KM && window.KM.DB;
  return (DB && DB.getFcSpecialEvents) ? DB.getFcSpecialEvents() : null;
}

/* BASE-EVENT-FC-READINESS §C — 'I COULD NOT READ THE EVENTS' IS NOT 'THIS SKU HAS NONE'.
 *
 * `_evtBuilderEventRows_` has always answered null for unavailable and an array for read, and the
 * comment above it says so. What was missing is that NOTHING DOWNSTREAM ASKED. The group-card build
 * stored `baseEventFc: be ? be.baseEventFc : null` and the cell printed `null` as an em dash under the
 * comment 'no persisted event prints an em dash' — so a model that could not be read printed, for
 * every SKU at once, the one glyph that means the opposite of what had happened.
 *
 * The same distinction this page already draws everywhere else: unread is not empty.
 */
function _evtEventModelAvailable_() { return Array.isArray(_evtBuilderEventRows_()); }

/* FC-SUMMARY-R2B-A3-R9 §1/§2 — THE CANONICAL UNIQUENESS KEY.

   FC_SUMMARY_SPEC §10.1: for one scoped SKU, one event flag in one target year is ONE event, whatever
   its dates. The window belongs to the CAMPAIGN's identity, not the event's — which is why two events
   differing only by window are not two events at all, they are one event stored twice.

   This is the client half. It exists so the operator is told BEFORE anything is attempted, and it is
   never the authority: a stale read model, a second tab and a concurrent save are all outside what a
   browser can know. 14_'s fcSeUniquenessConflict_ is the authority. */
function _evtUniquenessKey_(company, country, marketplace, sku, eventFlag, year) {
  function U(v) { return _trStrTok_(v).toUpperCase(); }
  return [U(company), U(country), U(_fcResolveMarketplaceKey(marketplace)), U(sku), U(eventFlag),
    _trNumTok_(year)].join('|');
}
/* Every authored SKU that already has an event under this flag+year, with the window it occupies.
   null = the read model is unavailable, which is NOT the same as no conflicts and must not be
   reported as a clean preflight. */
function _evtDuplicateConflicts_(skus, ctx) {
  var rows = _evtBuilderEventRows_();
  if (!Array.isArray(rows)) return null;
  var want = {};
  (skus || []).forEach(function (s) {
    var k = _evtUniquenessKey_(ctx.company, ctx.country, ctx.marketplace, s, ctx.eventFlag, ctx.year);
    want[k] = _trStrTok_(s);
  });
  var hits = [];
  rows.forEach(function (r) {
    var raw = r.raw || {};
    var k = _evtUniquenessKey_(raw.company || r.company, raw.country || r.country,
      raw.marketplace || r.marketplace, raw.sku || r.sku, raw.event_name || r.event,
      raw.year || r.year);
    if (!Object.prototype.hasOwnProperty.call(want, k)) return;
    hits.push({ sku: want[k],
      eventFcId: _trStrTok_(raw.event_fc_id || r.eventFcId),
      campaignId: _trStrTok_(raw.campaign_id || r.campaignId),
      startDate: _trStrTok_(raw.event_start_date || r.eventStartDate),
      endDate: _trStrTok_(raw.event_end_date || r.eventEndDate) });
  });
  return hits;
}
function _evtDuplicateRefusalText_(hits, ctx) {
  var lines = hits.map(function (h) {
    return '  \u2022 ' + h.sku + ' \u2014 already has a ' + ctx.eventFlag + ' ' + ctx.year
      + ' event for ' + (h.startDate || '?') + ' → ' + (h.endDate || '?');
  });
  return 'Nothing was written. ' + (hits.length === 1 ? 'This SKU already has' : 'These '
    + hits.length + ' SKUs already have') + ' a ' + ctx.eventFlag + ' event in ' + ctx.year + ':'
    + '\n\n' + lines.join('\n')
    + '\n\nOne event flag in one target year is one event, whatever its dates. Open the existing event'
    + ' and edit it \u2014 its forecast, its deal price and its event period can all be changed there.';
}
function _evtCampaignRows_() {
  var DB = window.KM && window.KM.DB;
  return (DB && DB.getCampaigns) ? (DB.getCampaigns() || []) : [];
}
function _evtCampaignLineRows_() {
  var DB = window.KM && window.KM.DB;
  return (DB && DB.getCampaignSkuLines) ? (DB.getCampaignSkuLines() || []) : [];
}

/* Persisted events in the selected scope + year, grouped by campaign — one entry per WINDOW.
   Returns null when the underlying rows are unavailable. */
function _evtExistingEvents_() {
  var rows = _evtBuilderEventRows_();
  if (!Array.isArray(rows)) return null;
  var site = _evtSelectedSite();
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var year = _trStrTok_((document.getElementById('event-target-year') || {}).value);
  function U(v) { return _trStrTok_(v).toUpperCase(); }
  var byCampaign = {};
  rows.forEach(function (r) {
    var raw = r.raw || {};
    var cid = _trStrTok_(r.campaignId || raw.campaign_id);
    if (!cid) return;   // an event with no campaign cannot be addressed by this builder at all
    if (U(raw.company || r.company) !== U(site.company)) return;
    if (U(raw.country || r.country) !== U(site.country)) return;
    if (U(_fcResolveMarketplaceKey(raw.marketplace || r.marketplace)) !== U(mkey)) return;
    if (year && _trNumTok_(raw.year || r.year) !== _trNumTok_(year)) return;
    var g = byCampaign[cid];
    if (!g) {
      g = byCampaign[cid] = { campaignId: cid, eventName: _trStrTok_(raw.event_name || r.event),
        startDate: _trStrTok_(raw.event_start_date || r.eventStartDate),
        endDate: _trStrTok_(raw.event_end_date || r.eventEndDate),
        year: _trStrTok_(raw.year || r.year), rows: [] };
    }
    g.rows.push(r);
  });
  return Object.keys(byCampaign).map(function (k) { return byCampaign[k]; })
    .sort(function (a, b) { return String(a.startDate).localeCompare(String(b.startDate)); });
}

/* The label an operator distinguishes two same-named windows by. The window IS the difference, so the
   window is in the label — a list of three identical "BFCM" lines is not a chooser. */
function _evtExistingLabel_(g) {
  var win = (g.startDate || '?') + ' → ' + (g.endDate || '?');
  return (g.eventName || '(unnamed)') + '  ·  ' + win + '  ·  ' + g.rows.length + ' SKU'
    + (g.rows.length === 1 ? '' : 's');
}

function _evtPopulateExistingSelect() {
  var sel = document.getElementById('event-existing-select');
  var note = document.getElementById('event-existing-note');
  if (!sel) return;
  var groups = _evtExistingEvents_();
  var prev = sel.value;
  if (groups === null) {
    sel.innerHTML = '<option value="">— existing events could not be read —</option>';
    sel.disabled = true;
    if (note) { note.textContent = 'The persisted events for this scope are not loaded, so this builder cannot tell a new event from an existing one. Close and reopen once the data has loaded.'; note.hidden = false; }
    return;
  }
  sel.disabled = false;
  var opts = ['<option value="">+ New event</option>'];
  groups.forEach(function (g) {
    opts.push('<option value="' + String(g.campaignId).replace(/"/g, '&quot;') + '">'
      + _evtExistingLabel_(g).replace(/</g, '&lt;') + '</option>');
  });
  sel.innerHTML = opts.join('');
  if (prev && groups.some(function (g) { return g.campaignId === prev; })) sel.value = prev;
  else if (prev) { sel.value = ''; _evtClearEditing_(); }
  if (note) {
    note.hidden = groups.length > 0 ? false : true;
    /* §10.1 — "the same SKU may have more than one window" was true under A3-R8 and is now exactly
       what the uniqueness rule forbids: one event flag in one target year is ONE event for a scoped
       SKU. Leaving the sentence there would advertise, on the picker itself, the create the server
       refuses. The count is per EVENT, which is what the list actually holds. */
    note.textContent = groups.length
      ? (groups.length + ' saved event' + (groups.length === 1 ? '' : 's') + ' in this scope and year. Selecting one loads its saved values for editing.')
      : '';
  }
}

function _evtOnExistingChange() {
  var sel = document.getElementById('event-existing-select');
  var id = sel ? sel.value : '';
  if (!id) { _evtClearEditing_(); return; }
  _evtHydrateExisting_(id);
}

/* Back to composing a NEW event. The window and rows are cleared because they belonged to the event
   that is no longer selected — leaving them would be the blank-form defect in reverse. */
function _evtClearEditing_() {
  _evtEditing_ = null;
  var _wcb = _evtWindowConfirmEl_(); if (_wcb) _wcb.checked = false;   // a confirmation belongs to ONE loaded event
  if (typeof _evtClearWindowChangeNotice_ === 'function') _evtClearWindowChangeNotice_();
  var sd = document.getElementById('event-start-date'); if (sd) sd.value = '';
  var ed = document.getElementById('event-end-date'); if (ed) ed.value = '';
  var rows = document.getElementById('event-sku-rows'); if (rows) rows.innerHTML = '';
  _evtAddSingleRow();
  _evtSetEditingChrome_();
}

/* The modal says which of the two things it is doing. A form that looks identical whether it will
   create or overwrite is how an operator overwrites without meaning to. */
/* FC-SUMMARY-R2B-A3-R6 §7/§9 — THE FOURTH MEANING, NAMED.
 *
 * A persisted event rehydrates into Single SKU mode, and the Forecast Qty box it lands in is the
 * event's own committed fc_qty — the CURRENT EVENT FC. It is not a baseline and must never read as
 * one: the Growth baseline is some OTHER campaign's event FC and the Adjust baseline is a Regular
 * forecast month, and both may legitimately differ from this. Single-SKU rows carry no baseline
 * column, so the two can never share a cell; what was missing was only the name. */
function _evtApplyCurrentFcLabel_(scope) {
  var on = _evtEditingActive_();
  var host = scope || document;
  var els = host.querySelectorAll ? host.querySelectorAll('.evt-fc') : [];
  for (var i = 0; i < els.length; i++) {
    els[i].placeholder = on ? 'Current Event FC' : 'Qty';
    els[i].title = on
      ? 'Current Event FC — the value stored for this event. Editing it is what the save will change.'
      : 'Forecast quantity for this event.';
  }
}
function _evtSetEditingChrome_() {
  var on = _evtEditingActive_();
  _evtApplyCurrentFcLabel_();
  /* §9 — THE BANNER DESCRIBES THE EVENT, NOT THE TABLES UNDER IT.

     It used to name the campaign, the line and the forecast ids and call them "this event\'s
     identity". Every one of those is a storage fact an operator has no way to act on, and the two
     sentences spent on them crowded out the four facts that ARE actionable: which event is open, when
     it runs, how big it is, and what can be changed from here. Two short lines, and no vocabulary
     from the write path. */
  var banner = document.getElementById('event-editing-banner');
  if (banner) {
    banner.hidden = !on;
    banner.innerHTML = '';
    if (on) {
      var n = _evtEditing_.skuCount;
      var l1 = document.createElement('div');
      l1.textContent = 'Editing ' + (_evtEditing_.eventName || 'this event')
        + ' · ' + _evtSavedWindowText_()
        + (n ? (' · ' + n + ' SKU' + (n === 1 ? '' : 's')) : '');
      var l2 = document.createElement('div');
      l2.textContent = 'Forecast quantities and prices can be edited here. '
        + 'To move the dates, tick “Change the event period”.';
      banner.appendChild(l1); banner.appendChild(l2);
    }
  }
  // A3-R9 §4 — THE DATES ARE NO LONGER DISABLED. One event flag in one target year is one event, so the
  // period is an attribute of this event rather than a second event's name, and the canonical way to
  // change it is here. The rest of the uniqueness key stays read-only while an event is loaded: editing
  // scope, flag or year would not change THIS event, it would address a different one.
  ['event-country', 'event-marketplace', 'event-target-year', 'event-name-input'].forEach(function (id) {
    var el = document.getElementById(id); if (el) { el.disabled = on; }
  });
  ['event-start-date', 'event-end-date'].forEach(function (id) {
    var el = document.getElementById(id); if (el) { el.disabled = false; }
  });
  var cb = _evtWindowConfirmEl_();
  if (cb && !on) cb.checked = false;
  _evtSyncPeriodUi_();   // §10.2 — the ONE owner of both period rows, called after the tick is settled
  var addBtn = document.getElementById('evt-add-row-btn');
  if (addBtn && on) { addBtn.disabled = false; addBtn.style.opacity = ''; }
}

/* Load one persisted event into the form: its window, its label, and one row per saved SKU carrying
   the saved deal price, discount and forecast quantity — plus the three canonical ids and the version
   token each row's save must quote. */
function _evtHydrateExisting_(campaignId) {
  var groups = _evtExistingEvents_();
  if (!Array.isArray(groups)) { _evtClearEditing_(); return; }
  var g = groups.filter(function (x) { return x.campaignId === campaignId; })[0];
  if (!g) { _evtClearEditing_(); return; }

  var camp = _evtCampaignRows_().filter(function (c) {
    return _trStrTok_(c.campaignId || (c.raw && c.raw.campaign_id) || c.campaign_id) === campaignId;
  })[0] || null;
  var campRaw = (camp && (camp.raw || camp)) || null;
  var lines = _evtCampaignLineRows_().filter(function (l) {
    var lr = l.raw || l;
    return _trStrTok_(lr.campaign_id || l.campaignId) === campaignId;
  });
  function lineById(id) {
    return lines.filter(function (l) {
      var lr = l.raw || l;
      return _trStrTok_(lr.campaign_sku_line_id || l.campaignSkuLineId) === _trStrTok_(id);
    })[0] || null;
  }

  _evtEditing_ = {
    campaignId: campaignId,
    campaignVersion: campRaw ? _cmpFingerprint_(campRaw) : '',
    campaignKnown: !!campRaw,
    eventName: g.eventName, startDate: g.startDate, endDate: g.endDate, year: g.year,
    // §9 — how many SKUs the SAVED event holds. Counted here rather than from the form, which the
    // operator may already have added a row to; the banner reports what is stored.
    skuCount: (g.rows || []).length,
    lines: {}
  };

  var flagEl = document.getElementById('event-name-input');
  if (flagEl && g.eventName) {
    var has = Array.prototype.slice.call(flagEl.options).some(function (o) { return o.value === g.eventName; });
    if (!has) { var o = document.createElement('option'); o.value = g.eventName; o.textContent = g.eventName; flagEl.appendChild(o); }
    flagEl.value = g.eventName;
  }
  var sd = document.getElementById('event-start-date'); if (sd) sd.value = String(g.startDate || '').slice(0, 10);
  var ed = document.getElementById('event-end-date'); if (ed) ed.value = String(g.endDate || '').slice(0, 10);
  var yr = document.getElementById('event-target-year'); if (yr && g.year) yr.value = g.year;
  _evtClearPeriodError();

  // Single-SKU rows are the shape that can carry per-SKU saved values; batch cards cannot.
  var single = document.querySelector('input[name="event-mode"][value="single"]');
  if (single) { single.checked = true; _evtSwitchMode(); }
  var wrap = document.getElementById('event-sku-rows');
  if (wrap) wrap.innerHTML = '';

  g.rows.forEach(function (r) {
    var raw = r.raw || {};
    _evtAddSingleRow();
    var row = wrap ? wrap.lastElementChild : null;
    if (!row) return;
    var sku = _trStrTok_(raw.sku || r.sku);
    var skuEl = row.querySelector('.evt-sku'); if (skuEl) skuEl.value = sku;
    _evtApplyRowPricing(row);                       // regular price + currency from pricing_list, as always
    var lineId = _trStrTok_(raw.campaign_sku_line_id || r.campaignSkuLineId);
    var line = lineId ? lineById(lineId) : null;
    var lr = line ? (line.raw || line) : null;
    if (lr) {
      var deal = lr.promo_price != null && lr.promo_price !== '' ? lr.promo_price : lr.deal_price;
      var dEl = row.querySelector('.evt-deal'); if (dEl && deal !== undefined && deal !== null && deal !== '') dEl.value = deal;
      var pEl = row.querySelector('.evt-disc');
      if (pEl && lr.discount_percent !== undefined && lr.discount_percent !== null && lr.discount_percent !== '') pEl.value = lr.discount_percent;
    }
    // A PERSISTED ZERO IS A VALUE. `|| ''` would blank it and the row would then read as new.
    var qtyRaw = raw.fc_qty;
    var qty = (qtyRaw === undefined || qtyRaw === null || qtyRaw === '') ? r.fcQty : qtyRaw;
    var qEl = row.querySelector('.evt-fc');
    if (qEl && qty !== undefined && qty !== null && qty !== '') qEl.value = _trNumTok_(qty);
    row.dataset.eventFcId = _trStrTok_(raw.event_fc_id || r.eventId);
    row.dataset.campaignSkuLineId = lineId;
    row.dataset.rowVersion = _seFingerprint_(raw);
    _evtEditing_.lines[String(sku).toUpperCase()] = {
      eventFcId: row.dataset.eventFcId,
      campaignSkuLineId: lineId,
      rowVersion: row.dataset.rowVersion
    };
  });
  if (wrap && !wrap.children.length) _evtAddSingleRow();
  _evtUpdateAddRowBtn();
  _evtSetEditingChrome_();
}

// ===== Special Event Builder v2 (Single SKU rows / Category-Series group cards) =====
var EVT_MAX_ROWS = 8;
/* FC-SUMMARY-R2B-A3-R9 §5 — THE CAP IS AN AUTHORING LIMIT, NOT A STORAGE LIMIT.
   EVT_MAX_ROWS bounds how many SKUs one person may compose by hand in a NEW event. An EXISTING event
   was authored under whatever limit applied then, or by the Category/Series path which has no such
   cap at all, so a persisted 13- or 20-SKU event is ordinary. Applying the authoring cap to it would
   refuse the save of an event the operator can see in full, or worse, hydrate 8 of 20 rows and save
   that as the whole event. */
function _evtRowCap_() { return _evtEditingActive_() ? Infinity : EVT_MAX_ROWS; }
var _evtGroups = [];   // batch-mode group cards: { category, series, regularPrice, skus[], dealPrice, fcQty }

// Open Event Modal (Scope → Event Info → Mode → Single-SKU rows OR Category/Series group cards).
function openEventModal() {
  // SECONDARY surface: the Special Event Builder reads campaigns / marketplace_skus / sku_details / pricing_list from
  // the broad cache. In Workspace mode the primary render never loads it, so lazy-load it here (once) before opening.
  // FC-SUMMARY-R1 — see openRegularUpdateModal: refuse visibly, never re-enter.
  if (_fcPrereqNeeded_('event')) { showFcModal('fc-mode-select-modal');
    _fcShowPrereqRefusal_({ code: 'FC_PREREQUISITES_MISSING', message: 'builder data is not loaded' }); return; }
  document.getElementById('event-target-year').value = fcTargetYear;
  var flagEl = document.getElementById('event-name-input'); if (flagEl) flagEl.value = 'Normal';
  var sdEl = document.getElementById('event-start-date'); if (sdEl) sdEl.value = '';
  var edEl = document.getElementById('event-end-date'); if (edEl) edEl.value = '';
  _evtClearPeriodError();
  // reset mode → single
  var single = document.querySelector('input[name="event-mode"][value="single"]'); if (single) single.checked = true;
  // reset batch controls (Category / Series multi-selects reset inside _populateEventBatchSelects)
  var dp = document.getElementById('event-discount-pct'); if (dp) dp.value = '';
  var by = document.getElementById('event-assist-base-year'); if (by) by.value = '';
  var bm = document.getElementById('event-assist-base-month'); if (bm) bm.value = '0';
  var gr = document.getElementById('event-assist-growth'); if (gr) gr.value = '';
  var am = document.getElementById('event-assist-method'); if (am) am.value = 'growth';
  var av = document.getElementById('event-assist-adjust-value'); if (av) av.value = '';
  var ap = document.getElementById('event-assist-preview'); if (ap) { ap.style.display = 'none'; ap.innerHTML = ''; }
  _evtGroups = [];
  var cards = document.getElementById('event-group-cards'); if (cards) cards.innerHTML = '';
  _evtSetAssistHelp('', '');
  _evtSetPreviewEnabled(false);   // Preview & Pre-fill disabled until cards are built (#5)
  _populateEventScopeSelects();
  _populateEventBatchSelects();
  _evtToggleAssistFields();   // AFTER scope + category/series are ready (populates Base Campaign for Growth)
  // Single-SKU rows: start with one empty row.
  var rows = document.getElementById('event-sku-rows'); if (rows) rows.innerHTML = '';
  _evtAddSingleRow();
  _evtSwitchMode();
  toggleEventFlagFields();
  _evtBindMsGlobalClose();   // outside-click / Escape closers (bound once)
  _evtCloseAllMs();          // never reopen a stale-open panel
  // §2 — every open starts as NEW, and the picker is what changes that. The reset above cleared the
  // form; this clears the SESSION, so a second open can never inherit the previous event's ids.
  _evtEditing_ = null;
  _evtSetEditingChrome_();
  _evtPopulateExistingSelect();
  showFcModal('fc-add-event-modal');
}

// Scope (country / marketplace) changed → regular prices depend on it; refresh the scoped SKU
// datalist, single-row prices, and rebuild group cards if already built.
function _evtOnScopeChange() {
  _evtPopulateSkuDatalist();
  _evtRefreshSingleRowPrices();
  if (_evtGroups.length) _evtBuildGroups();
  // A different scope is a different set of existing events. The selection cannot survive it: a
  // campaign_id from the old scope would be applied to the new one.
  if (_evtEditingActive_()) _evtClearEditing_();
  _evtPopulateExistingSelect();
}
// Country changed → rebuild the Marketplace(site) options for that country, then re-scope.
function _evtOnCountryChange() {
  _evtRebuildSites();
  _evtOnScopeChange();
}
// Resolve the selected Special Event site → { company, country, marketplace } (full identity).
// Marketplace value is "company|country|marketplace"; legacy/blank falls back to canonical marketplace.
function _evtSelectedSite() {
  var v = String((document.getElementById('event-marketplace') || {}).value || '');
  var parts = v.split('|');
  if (parts.length === 3) return { company: parts[0], country: parts[1], marketplace: parts[2] };
  var country = (document.getElementById('event-country') || {}).value || '';
  return { company: '', country: country, marketplace: _fcResolveMarketplaceKey(v) };
}
// Rebuild the Marketplace(site) options for the selected country (KM Amazon vs ResUS Amazon distinct).
function _evtRebuildSites() {
  var cSel = document.getElementById('event-country');
  var mSel = document.getElementById('event-marketplace');
  if (!mSel) return;
  var country = cSel ? cSel.value : '';
  var prev = mSel.value;
  var sites = _fcRegularSiteOptions(country);   // shared with Regular FC — full site identity
  mSel.innerHTML = sites.map(function(s){ return '<option value="' + s.value + '">' + s.label + '</option>'; }).join('');
  if (prev && sites.some(function(s){ return s.value === prev; })) mSel.value = prev;
}
// Populate the scoped SKU <datalist> (searchable Single-SKU input) from marketplace_skus matching the
// selected Company + Country + Marketplace (+ active). Out-of-scope SKUs are simply not offered.
function _evtPopulateSkuDatalist() {
  var list = document.getElementById('event-sku-datalist');
  if (!list) return;
  var rows = _evtScopedMskus();
  var seen = {}, opts = [];
  rows.forEach(function(m){ var s = String(m.sku || '').trim(); if (s && !seen[s]) { seen[s] = 1; opts.push(s); } });
  opts.sort();
  list.innerHTML = opts.map(function(s){ return '<option value="' + String(s).replace(/"/g, '&quot;') + '"></option>'; }).join('');
}

// Switch builder mode (single | batch).
function _evtSwitchMode() {
  var mode = _evtMode();
  var s = document.getElementById('event-mode-single');
  var b = document.getElementById('event-mode-batch');
  if (s) s.style.display = mode === 'single' ? '' : 'none';
  if (b) b.style.display = mode === 'batch' ? '' : 'none';
  // Highlight the active segmented button (deterministic — no reliance on :has()).
  Array.prototype.slice.call(document.querySelectorAll('#event-builder-mode .fc-mode-pill')).forEach(function(p){
    var input = p.querySelector('input[type="radio"]');
    p.classList.toggle('is-active', !!(input && input.checked));
  });
}
function _evtMode() {
  var el = document.querySelector('input[name="event-mode"]:checked');
  return el ? el.value : 'single';
}

// Populate Special Event Country / Marketplace selects. Marketplace carries the FULL site identity
// (company|country|marketplace) — same source & pattern as the Regular FC builder — so KM Amazon and
// ResUS Amazon are separate scopes. Company is derived from the selected site, never guessed.
function _populateEventScopeSelects() {
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  var mkts = demoOn ? [] : _fcGetMarketplaces();   // §14.4 — the page's one marketplaces owner
  var fcRows = demoOn ? [] : _fcGetRegularForecast();   // §2 — and the page's one forecast owner
  function distinct(arr) { var o = [], s = {}; arr.forEach(function(v){ v = String(v||'').trim(); if (v && !s[v]) { s[v]=1; o.push(v); } }); return o.sort(); }
  var srcCountries = demoOn
    ? (fcRegularMock || []).map(function(r){ return r.country; })
    : mkts.map(function(m){return m.country;}).concat(fcRows.map(function(r){return r.country;}));
  var countries = distinct(srcCountries);
  if (!countries.length) countries = ['US', 'UK', 'DE', 'CA', 'JP', 'AU'];
  var filters = (typeof getFcFilters === 'function') ? getFcFilters() : { countries: [], marketplaces: [] };
  var defCountry = (filters.countries && filters.countries.length === 1) ? filters.countries[0] : (countries[0] || '');
  var cSel = document.getElementById('event-country');
  if (cSel) cSel.innerHTML = countries.map(function(c){ return '<option value="' + c + '"' + (c === defCountry ? ' selected' : '') + '>' + c + '</option>'; }).join('');
  _evtRebuildSites();            // marketplace = full site identity for the selected country
  _evtPopulateSkuDatalist();     // scoped SKU list for the Single-SKU searchable input
}

// Populate Category / Series dropdown multi-selects for Batch mode from sku_details (distinct values).
// Defaults to "All" (All checkbox on, no individual option checked).
function _populateEventBatchSelects() {
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  function distinct(arr) { var o = [], s = {}; arr.forEach(function(v){ v = String(v||'').trim(); if (v && !s[v]) { s[v]=1; o.push(v); } }); return o.sort(); }
  function fill(which, values) {
    var box = document.getElementById('event-' + which + '-options');
    if (box) box.innerHTML = values.map(function(v){
      var safe = String(v).replace(/"/g, '&quot;');
      return '<label class="fc-ms-item"><input type="checkbox" value="' + safe + '" onchange="_evtMsChanged(\'' + which + '\')"><span>' + v + '</span></label>';
    }).join('');
    var allCb = document.getElementById('event-' + which + '-all'); if (allCb) allCb.checked = true;   // default = All
    var panel = document.getElementById('event-' + which + '-panel'); if (panel) panel.style.display = 'none';
    _evtMsUpdateText(which);
  }
  fill('category', distinct(details.map(function(d){ return d.category; })));
  fill('series', distinct(details.map(function(d){ return d.series; })));
  _evtUpdateDiscountRow();
}

// ---- In-modal dropdown multi-select (Category / Series), compact like the FC filter multiselect ----
// which = 'category' | 'series'. Selected values drive Build / Refresh Group Cards; "All" = null.
// Close behavior (fixed): toggling one panel closes the other; a checkbox change does NOT close the
// panel (multi-select stays open); clicking outside, pressing Escape, Build/Refresh, and closing the
// modal all close it; reopening the modal never restores a stale-open panel (reset on open + on close).
function _evtToggleMsPanel(which) {
  // stopPropagation so the just-fired click doesn't reach the outside-click closer and immediately
  // re-close the panel we are opening (the inline onclick has no event, so guard the current event).
  if (window.event) { try { window.event.stopPropagation(); } catch (e) {} }
  var panel = document.getElementById('event-' + which + '-panel');
  if (!panel) return;
  var show = (panel.style.display === 'none' || !panel.style.display);
  ['category','series'].forEach(function(w){ var p = document.getElementById('event-' + w + '-panel'); if (p) p.style.display = 'none'; });
  panel.style.display = show ? '' : 'none';
}

// Close BOTH in-modal multi-select panels (Category / Series).
function _evtCloseAllMs() {
  ['category','series'].forEach(function(w){ var p = document.getElementById('event-' + w + '-panel'); if (p) p.style.display = 'none'; });
}

// Bind the outside-click + Escape closers for the in-modal multi-selects EXACTLY once. A click that
// is not inside a `.fc-ms` closes any open panel; Escape closes them too. Checkbox changes happen
// inside `.fc-ms`, so they never trigger a close (the multi-select stays open across selections).
var _evtMsGlobalBound = false;
function _evtBindMsGlobalClose() {
  if (_evtMsGlobalBound) return;
  document.addEventListener('click', function(e) {
    // Only act while the event modal is open.
    var modal = document.getElementById('fc-add-event-modal');
    if (!modal || !modal.classList.contains('is-open')) return;
    if (e.target && e.target.closest && e.target.closest('#fc-add-event-modal .fc-ms')) return; // click inside a multi-select
    _evtCloseAllMs();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var modal = document.getElementById('fc-add-event-modal');
    if (!modal || !modal.classList.contains('is-open')) return;
    _evtCloseAllMs();
  });
  _evtMsGlobalBound = true;
}
// "All" checkbox toggled → checking it clears individual options (= all); then resync state/text.
function _evtMsAll(which, cb) {
  if (cb.checked) {
    Array.prototype.slice.call(document.querySelectorAll('#event-' + which + '-options input[type="checkbox"]'))
      .forEach(function(o){ o.checked = false; });
  }
  _evtMsSyncAll(which);
}
// Individual option toggled → All is on only when no option is checked.
function _evtMsChanged(which) { _evtMsSyncAll(which); }
function _evtMsSyncAll(which) {
  var opts = Array.prototype.slice.call(document.querySelectorAll('#event-' + which + '-options input[type="checkbox"]'));
  var anyChecked = opts.some(function(o){ return o.checked; });
  var allCb = document.getElementById('event-' + which + '-all');
  if (allCb) allCb.checked = !anyChecked;
  _evtMsUpdateText(which);
  if (which === 'category') _evtRebuildSeriesOptions();   // Series depends on selected Category
  _evtUpdateDiscountRow();
}
// Rebuild the Special Event Series options constrained to the selected Category(ies); preserve
// still-valid checked series (shared _fcSeriesForCategories helper; never hard-coded).
function _evtRebuildSeriesOptions() {
  var box = document.getElementById('event-series-options');
  if (!box) return;
  var prevSel = _evtMsValues('series');
  var valid = _fcSeriesForCategories(_evtMsValues('category'));
  box.innerHTML = valid.map(function(v){
    var safe = String(v).replace(/"/g, '&quot;');
    var checked = (prevSel && prevSel.indexOf(v) >= 0) ? ' checked' : '';
    return '<label class="fc-ms-item"><input type="checkbox" value="' + safe + '"' + checked + ' onchange="_evtMsChanged(\'series\')"><span>' + v + '</span></label>';
  }).join('');
  var anyChecked = Array.prototype.slice.call(box.querySelectorAll('input[type="checkbox"]')).some(function(o){ return o.checked; });
  var allCb = document.getElementById('event-series-all'); if (allCb) allCb.checked = !anyChecked;
  _evtMsUpdateText('series');
}
// Selected values, or null when "All" (All checked / nothing individually checked).
function _evtMsValues(which) {
  var allCb = document.getElementById('event-' + which + '-all');
  var opts = Array.prototype.slice.call(document.querySelectorAll('#event-' + which + '-options input[type="checkbox"]:checked'));
  if ((allCb && allCb.checked) || !opts.length) return null;   // null = All
  return opts.map(function(o){ return o.value; });
}
// Trigger summary text.
function _evtMsUpdateText(which) {
  var label = which === 'category' ? 'Category' : 'Series';
  var vals = _evtMsValues(which);
  var el = document.getElementById('event-' + which + '-text');
  if (!el) return;
  if (!vals) el.textContent = 'All ' + label;
  else if (vals.length <= 2) el.textContent = vals.join(', ');
  else el.textContent = vals.length + ' ' + label + ' selected';
}
// Discount % row is shown only when All Category OR All Series is selected (Part 4).
function _evtUpdateDiscountRow() {
  var catAll = _evtMsValues('category') === null;
  var serAll = _evtMsValues('series') === null;
  var discRow = document.getElementById('event-discount-row');
  if (discRow) discRow.style.display = (catAll || serAll) ? '' : 'none';
}

// Toggle Event Flag behaviour.
//   Normal    → NOT a special event; Save creates nothing.
//   != Normal → Forecast Qty required per SKU row / group card.
//
// FC-SUMMARY-R2B-A3-R10 §10.2 — THIS NO LONGER DECIDES WHETHER THE DATE CONTROLS EXIST.
//
// It was the ONLY owner of `event-period-row`, and it was keyed on the event flag alone. Two things
// then set that flag WITHOUT firing its change handler: `openEventModal` forces it to 'Normal', and
// `_evtHydrateExisting_` assigns the saved event's flag programmatically. A programmatic assignment
// raises no change event, so the row kept whatever visibility the last OPEN had left it with — hidden.
// A saved event therefore offered a "confirm the period change" tick above a period it was not
// showing, and A3-R9 had just made those dates load-bearing for the save. The two halves of one
// feature were owned by different functions and only one of them ran.
//
// The flag still decides whether a period is MEANINGFUL — 'Normal' writes no event at all, and the
// description below still says so. Visibility belongs to `_evtSyncPeriodUi_`, which derives it from
// the mode the builder is actually in.
function toggleEventFlagFields() {
  var flag = (document.getElementById('event-name-input') || {}).value || 'Normal';
  var isNormal = flag === 'Normal';
  _evtSyncPeriodUi_();
  var desc = document.getElementById('event-method-description');
  if (desc) {
    desc.innerHTML = isNormal
      ? '<strong>Normal:</strong> no special-event forecast is created — regular monthly forecast (fc_regular_forecast) already covers baseline demand. Nothing is written to campaigns / fc_special_events.'
      : '<strong>' + flag + ':</strong> Event Period + Target Year required. Forecast Qty is required per SKU row (Single) / group card (Category-Series). Save targets campaigns → campaign_sku_lines → fc_special_events.';
  }
}

// ---- Event Period (Start / End date) helpers (#3) ----
function _evtClearPeriodError() {
  var row = document.getElementById('event-period-error-row');
  var el = document.getElementById('event-period-error');
  if (el) el.textContent = '';
  if (row) row.style.display = 'none';
}
function _evtShowPeriodError(msg) {
  var row = document.getElementById('event-period-error-row');
  var el = document.getElementById('event-period-error');
  if (el) el.textContent = msg || '';
  if (row) row.style.display = msg ? '' : 'none';
}
// Validate the Event Start/End range and keep Target Year derived from the Start date's year.
// Returns true when the range is valid (or not yet required). Shows an inline message + returns false
// when start > end. Empty dates are allowed here (Save enforces "required" for non-Normal events).
function _evtValidatePeriod() {
  var start = (document.getElementById('event-start-date') || {}).value || '';
  var end = (document.getElementById('event-end-date') || {}).value || '';
  // Derive Target Year consistently from the Start date (fallback: End date). Keeps year in sync.
  var yearSrc = start || end;
  if (yearSrc) {
    var y = parseInt(yearSrc.slice(0, 4), 10);
    var ty = document.getElementById('event-target-year');
    if (ty && y) ty.value = y;
  }
  if (start && end && start > end) {   // ISO yyyy-mm-dd compares lexicographically
    _evtShowPeriodError('Event Start Date must be on or before Event End Date.');
    return false;
  }
  _evtClearPeriodError();
  return true;
}
// Compose the legacy free-text event_period string from the two dates (kept for back-compat display).
function _evtComposePeriod(start, end) {
  if (start && end) return start + '~' + end;
  return start || end || '';
}

// Enable/disable the "Preview & Pre-fill" button (disabled until group cards are built — #5).
function _evtSetPreviewEnabled(on) {
  var btn = document.getElementById('event-assist-btn');
  if (btn) { btn.disabled = !on; btn.style.opacity = on ? '' : '0.5'; btn.style.pointerEvents = on ? '' : 'none'; }
}

// ---- Scoped marketplace_skus for the selected site (Company + Country + Marketplace, active only) ----
// Company is part of the scope key, so KM Amazon SKUs never leak into a ResUS Amazon scope.
var _EVT_INACTIVE_STATUS = { inactive: 1, discontinued: 1, closed: 1, archived: 1, delisted: 1, inactive_sku: 1 };
function _evtScopedMskus() {
  var site = _evtSelectedSite();
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var mskus = (window.KM && window.KM.DB && window.KM.DB.getMarketplaceSkus) ? window.KM.DB.getMarketplaceSkus() : [];
  return mskus.filter(function(m){
    if (site.company && up(m.company) !== up(site.company)) return false;
    if (site.country && up(m.country) !== up(site.country)) return false;
    if (mkey && lo(m.marketplace) !== lo(mkey)) return false;
    var st = lo(m.marketplaceSkuStatus);
    if (st && _EVT_INACTIVE_STATUS[st]) return false;    // exclude only explicitly-inactive rows
    return true;
  });
}

// Decimal precision for a currency (JPY/KRW have no minor unit). Used for Deal Price rounding.
function _evtDealPrecision(currency) {
  var c = String(currency || 'USD').trim().toUpperCase();
  return (c === 'JPY' || c === 'KRW' || c === 'VND' || c === 'CLP') ? 0 : 2;
}
function _evtRoundMoney(value, currency) {
  var p = _evtDealPrecision(currency), f = Math.pow(10, p);
  return Math.round(Number(value) * f) / f;
}

// ---- CANONICAL regional pricing resolver (the SINGLE lookup shared by Add Regular FC + Add Special
// Event FC). Regular Price AND Currency come from ONE pricing_list row: matched by marketplace_sku_id
// (preferred canonical identity), else by full business identity company|country|marketplace|sku|site_sku
// (only when marketplace_sku_id is not held). pricing_list is the sole price source of truth
// (PRICING_DATABASE_MAPPING §33; effective field = `regular_price`). NEVER: first-match by master SKU,
// cross-country / cross-marketplace fallback, another site's price, marketplace_skus / sku_details price,
// hardcoded USD, or a fabricated 0 (MISSING → regularPrice/currency = null). Returns
// { marketplaceSkuId, sku, regularPrice(number|null), currency(string|null), source:'pricing_list', found }.
function resolveRegionalPricingContext(ctx) {
  ctx = ctx || {};
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  var out = { marketplaceSkuId: String(ctx.marketplaceSkuId==null?'':ctx.marketplaceSkuId).trim(),
    sku: String(ctx.sku==null?'':ctx.sku).trim(), regularPrice: null, currency: null,
    source: 'pricing_list', found: false };
  var DB = (typeof window !== 'undefined') && window.KM && window.KM.DB;
  var pl = (DB && DB.getPricingList) ? DB.getPricingList() : [];
  var mkey = (typeof _fcResolveMarketplaceKey === 'function') ? _fcResolveMarketplaceKey(ctx.marketplace) : ctx.marketplace;
  var row = null;
  // 1) canonical: exact marketplace_sku_id match.
  if (out.marketplaceSkuId) {
    row = pl.filter(function(x){ return up(x.marketplaceSkuId) === up(out.marketplaceSkuId); })[0] || null;
  }
  // 2) only if no marketplace_sku_id held: full business identity (NO cross country/marketplace).
  if (!row && !out.marketplaceSkuId && out.sku) {
    row = pl.filter(function(x){
      return (up(x.sku) === up(out.sku) || up(x.siteSku) === up(out.sku)) &&
        (!ctx.country || up(x.country) === up(ctx.country)) &&
        (!mkey || up(x.marketplace) === up(mkey));
    })[0] || null;
  }
  if (row) {
    out.found = true;
    if (!out.marketplaceSkuId) out.marketplaceSkuId = String(row.marketplaceSkuId==null?'':row.marketplaceSkuId).trim();
    // pricing_list normalizer coerces a missing regular_price to 0 — read raw to tell "missing" from "0".
    var rawPrice = row.raw ? row.raw.regular_price : row.regularPrice;
    var num = parseFloat(rawPrice);
    out.regularPrice = (rawPrice === '' || rawPrice == null || isNaN(num) || num <= 0) ? null : num;
    var cur = String(row.currency==null?'':row.currency).trim();
    out.currency = cur || null;
  }
  return out;
}

// Scope-aware wrapper for the Special Event Builder. Delegates the price/currency to the canonical
// resolver (pricing_list only — never marketplace_skus). `inScope` = the SKU exists in the selected
// Company/Country/Marketplace marketplace_skus scope. MISSING price → regularPrice/currency null.
function _evtSkuPricing(sku) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  var m = _evtScopedMskus().filter(function(x){ return up(x.sku) === up(sku); })[0];
  var site = _evtSelectedSite();
  var ctx = resolveRegionalPricingContext({ company: site.company, country: site.country,
    marketplace: site.marketplace, sku: sku, marketplaceSkuId: m ? m.marketplaceSkuId : '' });
  return { inScope: !!m, marketplaceSkuId: ctx.marketplaceSkuId || (m ? m.marketplaceSkuId : ''),
    regularPrice: ctx.regularPrice, currency: ctx.currency };
}
// Back-compat: legacy callers expect a bare number (0 when missing).
function _evtRegularPrice(sku) {
  var r = _evtSkuPricing(sku);
  return r.regularPrice == null ? 0 : r.regularPrice;
}

// Resolve the canonical marketplace_id for the selected site (company + country + marketplace).
function _evtResolveMarketplaceId(site) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var mkts = _fcGetMarketplaces();                 // §14.4 — the page's one marketplaces owner
  var m = mkts.filter(function(x){
    return (!site.company || up(x.company) === up(site.company)) &&
      (!site.country || up(x.country) === up(site.country)) &&
      (!mkey || lo(x.marketplace) === lo(mkey));
  })[0];
  return m ? m.marketplaceId : '';
}

// ADJUST base: fc_regular_forecast[baseYear][baseMonthIdx] for a SKU in the selected scope
// (company + country + marketplace). Returns a number, or null when there is no scoped row/month
// (→ "No Base Forecast", SKU skipped, never fabricated 0).
//
// FC-SUMMARY-R2B-A3-R5 §2/§3 — WHICH STORE, NOT WHICH SHAPE.
//
// A3-R4 taught the Builder to resolve a Base FC and proved it against synthetic rows. In production
// every card still read '—', because the rows this function asked for are not where it was asking.
// R3-R1 moved the FC Summary PRIMARY render onto the scoped fcSummary workspace and explicitly stopped
// loading the broad Operation DB for it; the SECONDARY builder tables are lazily fetched into the broad
// cache when a builder opens, and that list — sku_details, marketplace_skus, marketplaces, campaigns,
// campaign_sku_lines, pricing_list, fc_special_events — has never contained fc_regular_forecast, by
// design. So the table BEHIND the modal showed a Regular FC out of the read model while
// `KM.DB.getFcRegularForecast()` in front of it answered [] out of a cache nobody had filled.
//
// The shape was never the problem and is not adjusted here: both stores run the identical
// `normalizeFcRegularForecastRecord` and the identical filter, so a row from either is the same row.
// The correction is to ask the page's own read-model-first accessor — the one the Regular table itself
// renders from — which returns the workspace rows in Workspace mode and the broad-cache rows in Legacy.
// There is now exactly one answer to "what is this SKU's Regular FC" on this page.
function _evtBaseFcForSku(sku, monthIdx, baseYear) {
  var site = _evtSelectedSite();
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  if (!baseYear) baseYear = parseInt((document.getElementById('event-assist-base-year') || {}).value, 10);
  if (monthIdx == null || monthIdx < 0 || !baseYear) return null;
  var rows = _fcGetRegularForecast();
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var row = rows.filter(function(r){
    return up(r.sku) === up(sku) && String(r.year) === String(baseYear) &&
      (!site.company || up(r.company) === up(site.company)) &&
      (!site.country || up(r.country) === up(site.country)) &&
      (!mkey || lo(r.marketplace) === lo(mkey));
  })[0];
  if (!row) return null;
  var raw = row[REG_MONTH_KEYS[monthIdx]];
  if (raw === '' || raw == null) return null;
  var n = Number(raw);
  return isNaN(n) ? null : Math.round(n);
}
// GROWTH base: Σ fc_special_events.fc_qty for the selected Base Campaign + this SKU in the current
// scope. Returns a number, or null when the campaign has no FC for this SKU (→ "No Base Campaign FC",
// SKU skipped, never fabricated 0). Matches by campaign_id (never by event_name string).
function _evtGrowthBaseForSku(campaignId, sku) {
  if (!campaignId) return null;
  var site = _evtSelectedSite();
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var events = (window.KM && window.KM.DB && window.KM.DB.getFcSpecialEvents) ? window.KM.DB.getFcSpecialEvents() : [];
  var total = null;
  events.forEach(function(e){
    if (String(e.campaignId || '') !== String(campaignId)) return;
    if (up(e.sku) !== up(sku)) return;
    if (site.company && e.company && up(e.company) !== up(site.company)) return;
    if (site.country && e.country && up(e.country) !== up(site.country)) return;
    if (mkey && e.marketplace && lo(e.marketplace) !== lo(mkey)) return;
    total = (total || 0) + (parseFloat(e.fcQty) || 0);
  });
  return total;
}
// Populate the Base Campaign dropdown (Apply Growth Rate). Value = campaign_id (stable key, never the
// {year}_{event} string); label = {year}_{event_name}. Candidates = campaigns that have valid scoped
// fc_special_events FC (matching company + country + marketplace + selected category/series, fc_qty>0).
function _evtPopulateBaseCampaigns() {
  var sel = document.getElementById('event-assist-base-campaign');
  if (!sel) return;
  var site = _evtSelectedSite();
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  function lo(v){ return String(v==null?'':v).trim().toLowerCase(); }
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var cats = _evtMsValues('category'), series = _evtMsValues('series');
  var campaigns = (window.KM && window.KM.DB && window.KM.DB.getCampaigns) ? window.KM.DB.getCampaigns() : [];
  var events = (window.KM && window.KM.DB && window.KM.DB.getFcSpecialEvents) ? window.KM.DB.getFcSpecialEvents() : [];
  // Which campaigns have valid scoped FC?
  var valid = {};
  events.forEach(function(e){
    if (!e.campaignId) return;
    if (site.company && e.company && up(e.company) !== up(site.company)) return;
    if (site.country && e.country && up(e.country) !== up(site.country)) return;
    if (mkey && e.marketplace && lo(e.marketplace) !== lo(mkey)) return;
    if (cats && cats.indexOf(e.category) < 0) return;
    if (series && series.indexOf(e.series) < 0) return;
    if (!(parseFloat(e.fcQty) > 0)) return;
    valid[e.campaignId] = 1;
  });
  var list = campaigns.filter(function(c){
    if (!c.campaignId || !valid[c.campaignId]) return false;
    if (site.company && c.company && up(c.company) !== up(site.company)) return false;
    if (site.country && c.country && up(c.country) !== up(site.country)) return false;
    if (mkey && c.marketplace && lo(c.marketplace) !== lo(mkey)) return false;
    return true;
  });
  var prev = sel.value;
  if (!list.length) { sel.disabled = true; sel.innerHTML = '<option value="">(no matching campaign with FC data)</option>'; return; }
  sel.disabled = false;
  sel.innerHTML = '<option value="">Select Base Campaign</option>' + list.map(function(c){
    var name = c.eventFlag || c.promotionType || c.campaignName || 'Campaign';
    var label = (c.year ? (c.year + '_') : '') + String(name).replace(/\s+/g, '_');
    return '<option value="' + c.campaignId + '">' + label + '</option>';
  }).join('');
  if (prev && list.some(function(c){ return c.campaignId === prev; })) sel.value = prev;
}
// Month index (0–11) of the event Start Date; null when not set.
function _evtEventMonthIdx() {
  var sd = ((document.getElementById('event-start-date') || {}).value || '').trim();
  if (!sd || sd.length < 7) return null;
  var m = parseInt(sd.slice(5, 7), 10);
  return (m >= 1 && m <= 12) ? (m - 1) : null;
}

// ================= Single SKU mode =================
// Row layout (6 cols): SKU (scoped datalist) · Regular Price (readonly) · Discount % · Deal Price ·
// Forecast Qty · remove. Regular Price + marketplace_sku_id resolve from the scoped pricing; a SKU
// outside the selected Company/Country/Marketplace scope is flagged and blocked at Save.
function _evtAddSingleRow() {
  var wrap = document.getElementById('event-sku-rows');
  if (!wrap) return;
  if (wrap.children.length >= _evtRowCap_()) { alert('Maximum ' + EVT_MAX_ROWS + ' SKU rows.'); return; }
  var row = document.createElement('div');
  row.className = 'fc-evt-row fc-evt-row--single';
  row.innerHTML =
    '<input type="text" class="evt-sku" list="event-sku-datalist" placeholder="Search SKU…" onchange="_evtSingleRowSkuChange(this)">' +
    '<input type="number" class="evt-reg" placeholder="Regular" step="0.01" readonly>' +
    '<input type="number" class="evt-disc" placeholder="%" min="0" max="100" step="0.1" onchange="_evtSingleRowDiscChange(this)">' +
    '<input type="number" class="evt-deal" placeholder="Deal" step="0.01">' +
    '<input type="number" class="evt-fc" placeholder="Qty" min="0">' +
    '<span class="evt-cur" title="pricing_list currency (applies to Regular + Deal)">—</span>' +
    '<button type="button" class="fc-evt-row-remove" title="Remove" onclick="_evtRemoveSingleRow(this)">×</button>';
  wrap.appendChild(row);
  _evtApplyCurrentFcLabel_(row);      // a row added while an event is loaded is labelled like the rest
  _evtUpdateAddRowBtn();
}
function _evtRemoveSingleRow(btn) {
  var row = btn.closest('.fc-evt-row');
  if (row) row.remove();
  var wrap = document.getElementById('event-sku-rows');
  if (wrap && !wrap.children.length) _evtAddSingleRow();  // always keep at least one row
  _evtUpdateAddRowBtn();
}
function _evtUpdateAddRowBtn() {
  var wrap = document.getElementById('event-sku-rows');
  var btn = document.getElementById('event-add-row-btn');
  if (wrap && btn) { var full = wrap.children.length >= _evtRowCap_(); btn.disabled = full; btn.style.opacity = full ? '0.5' : ''; }
}
// Apply a row's Regular Price + scope/missing-price state from the scoped pricing lookup.
function _evtApplyRowPricing(row) {
  var sku = ((row.querySelector('.evt-sku') || {}).value || '').trim();
  var regEl = row.querySelector('.evt-reg');
  var skuEl = row.querySelector('.evt-sku');
  row.dataset.marketplaceSkuId = '';
  row.dataset.priceState = '';
  if (!sku) { if (regEl) regEl.value = ''; if (skuEl) skuEl.classList.remove('is-invalid'); return; }
  var pr = _evtSkuPricing(sku);
  var curEl = row.querySelector('.evt-cur');
  row.dataset.marketplaceSkuId = pr.marketplaceSkuId || '';
  row.dataset.currency = '';
  if (curEl) { curEl.textContent = '—'; curEl.classList.remove('fc-evt-warn'); }
  if (!pr.inScope) {
    if (regEl) { regEl.value = ''; regEl.placeholder = 'Out of scope'; }
    if (skuEl) skuEl.classList.add('is-invalid');
    row.dataset.priceState = 'out_of_scope';
    return;
  }
  if (skuEl) skuEl.classList.remove('is-invalid');
  if (pr.regularPrice == null) {
    if (regEl) { regEl.value = ''; regEl.placeholder = 'Missing Regular Price'; }
    row.dataset.priceState = 'missing_price';
    if (curEl) { curEl.textContent = '—'; curEl.classList.add('fc-evt-warn'); }
    return;
  }
  if (regEl) regEl.value = pr.regularPrice;
  row.dataset.priceState = 'ok';
  // Currency = the SAME pricing_list row's currency (auxiliary visual only; input stays pure numeric).
  row.dataset.currency = pr.currency || '';
  if (curEl) curEl.textContent = pr.currency || '—';
  _evtRecalcRowDeal(row);
}
// Recompute a row's Deal Price from its Discount % (deal = regular × (1 − disc/100)); blank disc leaves deal.
function _evtRecalcRowDeal(row) {
  var reg = parseFloat((row.querySelector('.evt-reg') || {}).value);
  var disc = parseFloat((row.querySelector('.evt-disc') || {}).value);
  if (isNaN(reg) || isNaN(disc)) return;
  var dealEl = row.querySelector('.evt-deal');
  if (dealEl) dealEl.value = _evtRoundMoney(reg * (1 - disc / 100), row.dataset.currency || 'USD');
}
function _evtSingleRowSkuChange(input) {
  var row = input.closest('.fc-evt-row'); if (!row) return;
  _evtApplyRowPricing(row);
}
function _evtSingleRowDiscChange(input) {
  var row = input.closest('.fc-evt-row'); if (!row) return;
  _evtRecalcRowDeal(row);
}
function _evtRefreshSingleRowPrices() {
  var wrap = document.getElementById('event-sku-rows'); if (!wrap) return;
  Array.prototype.slice.call(wrap.querySelectorAll('.fc-evt-row')).forEach(function(row){ _evtApplyRowPricing(row); });
}
// Read the single-SKU rows into objects (carrying scope/price state + marketplace_sku_id).
function _evtReadSingleRows() {
  var wrap = document.getElementById('event-sku-rows'); if (!wrap) return [];
  return Array.prototype.slice.call(wrap.querySelectorAll('.fc-evt-row')).map(function(row){
    var regRaw = (row.querySelector('.evt-reg') || {}).value;
    return {
      sku: ((row.querySelector('.evt-sku') || {}).value || '').trim(),
      marketplaceSkuId: row.dataset.marketplaceSkuId || '',
      priceState: row.dataset.priceState || '',
      currency: row.dataset.currency || '',
      regularPrice: (regRaw === '' || regRaw == null) ? null : (parseFloat(regRaw) || 0),
      discountPercent: parseFloat((row.querySelector('.evt-disc') || {}).value),
      dealPrice: parseFloat((row.querySelector('.evt-deal') || {}).value),
      fcQty: parseInt((row.querySelector('.evt-fc') || {}).value, 10),
      // §6 — a rehydrated row carries the ids it was loaded WITH, so an edit updates that row rather
      // than minting a new lineage beside it. A row the operator added by hand carries none, and is
      // a create.
      eventFcId: row.dataset.eventFcId || '',
      campaignSkuLineId: row.dataset.campaignSkuLineId || '',
      rowVersion: row.dataset.rowVersion || ''
    };
  }).filter(function(r){ return r.sku; });
}

// Derive category / series for a SKU from sku_details. Company is NOT first-matched from
// marketplace_skus anymore — it comes from the selected site (company|country|marketplace).
function _fcDeriveSkuMeta(sku) {
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  var meta = { category: '', series: '', company: _evtSelectedSite().company || '' };
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  var d = details.filter(function(x){ return up(x.sku) === up(sku); })[0];
  if (d) { meta.category = d.category || ''; meta.series = d.series || ''; }
  return meta;
}

// ================= Category / Series mode =================
// Candidate {sku, category, series, marketplaceSkuId, regularPrice} rows for the selected SITE scope
// (company + country + marketplace, active) filtered by the Category / Series multiselect.
function _evtCandidateRows() {
  var cats = _evtMsValues('category');   // null = All Category
  var series = _evtMsValues('series');   // null = All Series
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }
  var details = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
  var detBySku = {}; details.forEach(function(d){ detBySku[up(d.sku)] = d; });
  var seen = {};
  return _evtScopedMskus().map(function(m){
    var d = detBySku[up(m.sku)] || {};
    var pr = _evtSkuPricing(m.sku);
    return { sku: m.sku, category: d.category || '', series: d.series || '',
      marketplaceSkuId: pr.marketplaceSkuId || m.marketplaceSkuId || '', regularPrice: pr.regularPrice, currency: pr.currency };
  }).filter(function(r){
    if (!r.sku || seen[up(r.sku)]) return false;
    var cOk = !cats || cats.indexOf(r.category) >= 0;
    var sOk = !series || series.indexOf(r.series) >= 0;
    if (cOk && sOk) { seen[up(r.sku)] = 1; return true; }
    return false;
  });
}

/* FC-SUMMARY-R2B-A3-R4 §2 — THE EVENT-MONTH BASE FC, AND THE ONE PLACE IT IS RESOLVED.
 *
 * The card has a Base FC column and a Diff column that subtracts from it, but `_evtBuildGroups()`
 * only ever carried a PREVIOUS row's value forward (`p ? p.baseFc : null`). On a fresh Build there is
 * no previous row, so every card rendered '—' and every Preview row read 'No Base FC' — while the same
 * SKUs plainly showed a Regular FC on the FC Summary table behind the modal.
 *
 * Nothing new is computed here. `_evtBaseFcForSku()` is the existing canonical reader of
 * fc_regular_forecast, and the event's own month and year are the ones the SAVE already derives:
 * `_evtEventMonthIdx()` from the event start date, and the year from that same date, falling back to
 * Target Year exactly as `saveEventUpdate` does. This wrapper exists so Build, Single SKU and Preview
 * cannot drift into three answers for one question.
 *
 * Returns a number (0 included — a stored zero is a value), or null when fc_regular_forecast genuinely
 * has no row or no figure for that month. Reads memory only; never writes. */
function _evtEventBaseFcForSku(sku) {
  var monthIdx = _evtEventMonthIdx();
  if (monthIdx == null) return null;
  var sd = ((document.getElementById('event-start-date') || {}).value || '').trim();
  var year = parseInt(sd.slice(0, 4), 10) || parseInt((document.getElementById('event-target-year') || {}).value, 10);
  if (!year) return null;
  return _evtBaseFcForSku(sku, monthIdx, year);
}

// Build group cards keyed by category + series ONLY (SKUs with different regular prices stay in the
// same card as separate rows — never split by price). Each row: {sku, marketplaceSkuId, regularPrice,
// discountPct, dealPrice, baseFc, newFc}. Preserves any values the user already typed for the same
// (category||series, sku).
/* ==============================================================================================
   FC-SUMMARY-R2B-A3-R6 §6/§7 — FOUR MEANINGS, ONE COLUMN, AND WHY THAT WAS WRONG.

   A3-R5 taught the Build step to resolve a baseline, which fixed an always-empty column and
   introduced a subtler fault: it resolved the SAME quantity — fc_regular_forecast at the event's own
   month — whatever assist method was selected. The three methods do not share a baseline:

     Apply Growth Rate      baseline = Σ fc_special_events.fc_qty for the selected Base Campaign.
                            A Regular-forecast figure in that column is not a weaker answer, it is a
                            different quantity wearing the right column's name.
     Adjust from Base FC    baseline = fc_regular_forecast at the operator's Base Year + Base Month,
                            which they may deliberately set away from the event's own month.
     Manual                 there is no computational baseline. Showing one invites the operator to
                            read a number they are not editing against.

   Preview & Pre-fill has always dispatched correctly on the method; only Build did not, so the cards
   disagreed with the preview that followed them. This is the same dispatch, moved to the one place
   both steps can share, and the column is named for whichever quantity it is currently holding.

   The fourth meaning — a persisted event's own fc_qty — is deliberately NOT here. An existing event
   rehydrates into Single SKU mode, whose rows have no baseline column at all; its stored value is the
   CURRENT EVENT FC and is labelled as such on that control. It must never arrive in this column,
   because 'what this event is forecast to sell' and 'what we are computing that from' are different
   facts, and one of them is already committed. */
/* ==============================================================================================
   FC-SUMMARY-R2B-A3-R7 §2/§4/§5 — THE GROUP BUILDER NEVER ASKED WHETHER THE EVENT ALREADY EXISTED.

   TWO LIVE FAILURES, ONE CAUSE. Saving an edit from the Category/Series cards answered
   STALE_SPECIAL_EVENT_VERSION at stage 3, and the cards showed no sign that a persisted event FC
   existed at all — while fc_special_events plainly held one.

   _evtBuildGroups composed each row from sku_details and pricing_list and nothing else. It carried
   no event_fc_id, no campaign_sku_line_id and no row_version, so the save composed a VERSIONLESS
   payload for a row the server could still resolve by business key. 14_'s gate then did exactly what
   it is written to do: a save that would change a stored event while quoting no version is refused,
   because 'the builder composes a versionless save only when its read model held no match'. On the
   single-row path that premise holds — _evtHydrateExisting_ puts the ids on the row's dataset. On the
   group path it never did, so the premise was false and every group-card edit looked like a stale
   writer to a server that was right to refuse it.

   So the group builder now resolves the same persisted event the picker already resolves, through the
   same owner. _evtExistingEvents_() is that owner: it groups fc_special_events by campaign for the
   selected site and target year, and it matches on scope and window — never on campaign name. No new
   key is invented here.

   BASE EVENT FC IS NOT BASE FC. Base FC is a computational baseline chosen by the assist method
   (another campaign's event FC, or a Regular forecast month). Base Event FC is the value THIS event
   already has stored. They are different questions with different answers, and now different
   columns: a Growth baseline of 7000 and a persisted current FC of 4200 are both true at once. */
function _evtBaseEventGroup_() {
  var groups = _evtExistingEvents_();
  if (!Array.isArray(groups)) return null;              // unread is not empty
  if (_evtEditingActive_()) {
    return groups.filter(function (g) { return g.campaignId === _evtEditing_.campaignId; })[0] || null;
  }
  // Composing a new event: the persisted match is the one whose WINDOW this form is describing.
  var sd = _trStrTok_((document.getElementById('event-start-date') || {}).value);
  var ed = _trStrTok_((document.getElementById('event-end-date') || {}).value);
  if (!sd || !ed) return null;
  var nm = _trStrTok_((document.getElementById('event-name-input') || {}).value).toUpperCase();
  return groups.filter(function (g) {
    if (_trStrTok_(g.startDate) !== sd || _trStrTok_(g.endDate) !== ed) return false;
    return !nm || _trStrTok_(g.eventName).toUpperCase() === nm;
  })[0] || null;
}
/* The persisted event for one SKU inside that window, with the ids and the version its next save must
   carry. null when this SKU has no persisted event — a different fact from a stored 0. */
function _evtBaseEventForSku(sku) {
  var g = _evtBaseEventGroup_();
  if (!g) return null;
  var want = _trStrTok_(sku).toUpperCase();
  var r = (g.rows || []).filter(function (x) {
    var raw0 = x.raw || {};
    return _trStrTok_(raw0.sku || x.sku).toUpperCase() === want;
  })[0];
  if (!r) return null;
  var raw = r.raw || {};
  // A PERSISTED ZERO IS A VALUE. The normalizer's fcQty is parseFloat(...)||0, which cannot tell a
  // stored 0 from a blank cell, so the raw cell decides and the normalized value is only a fallback.
  var q = raw.fc_qty;
  var qty = (q === undefined || q === null || q === '') ? null : Number(q);
  if (qty != null && isNaN(qty)) qty = null;
  return {
    eventFcId: _trStrTok_(raw.event_fc_id || r.eventFcId),
    campaignSkuLineId: _trStrTok_(raw.campaign_sku_line_id || r.campaignSkuLineId),
    rowVersion: _seFingerprint_(raw),
    baseEventFc: qty
  };
}
/* A3-R8 §3 — WHICH PERSISTED EVENT DOES THIS SINGLE ROW ADDRESS?

   While an event is LOADED the answer is the row it was hydrated from: the window cannot have moved,
   because _evtWindowChangeGate_ refuses to save one that has. Once it is NOT loaded — a fresh
   '+ New Event', or the detach half of the window-change decision — the answer is whatever the
   window the form now states already holds, resolved through the same owner the group cards use.

   Both directions matter. Resolving finds the event that already exists at the new window, so the
   save UPDATES it under the ordinary version rules rather than being refused as stale for quoting
   no version. Discarding finds nothing when the window holds nothing, so a leftover id from the
   window the operator has just left can never travel with a payload that would rewrite that other
   event's dates. Neither half is optional: the ids and the window are one fact. */
function _evtSingleRowIdentity_(r) {
  r = r || {};
  if (_evtEditingActive_()) {
    return { eventFcId: r.eventFcId || '', campaignSkuLineId: r.campaignSkuLineId || '',
      rowVersion: r.rowVersion || '' };
  }
  var be = (typeof _evtBaseEventForSku === 'function') ? _evtBaseEventForSku(r.sku) : null;
  if (!be) return { eventFcId: '', campaignSkuLineId: '', rowVersion: '' };
  return { eventFcId: be.eventFcId || '', campaignSkuLineId: be.campaignSkuLineId || '',
    rowVersion: be.rowVersion || '' };
}
function _evtBaselineKind_() {
  var m = _evtAssistMethod();
  return (m === 'growth' || m === 'adjust') ? m : 'manual';
}
function _evtBaselineLabel_() {
  var k = _evtBaselineKind_();
  if (k === 'growth') return 'Base Campaign FC';
  if (k === 'adjust') return 'Base Forecast';
  return 'Base (n/a)';
}
/* §8 — 'YOU HAVE NOT TOLD ME YET' IS NOT 'THERE IS NONE'.
   Returns '' when the baseline is resolvable, or the sentence naming the input still missing. Kept
   apart from the lookup on purpose: a missing Event Period and an absent forecast row both used to
   render an identical '—', which is the state the operator read as "the data is not there". */
function _evtBaselineMissingInput_() {
  var k = _evtBaselineKind_();
  if (k === 'manual') return '';
  if (k === 'growth') {
    return ((document.getElementById('event-assist-base-campaign') || {}).value || '')
      ? '' : 'Select a Base Campaign to resolve Base Campaign FC.';
  }
  // ADJUST — an explicit Base Year + Base Month answers on its own and needs no event window.
  var by = parseInt((document.getElementById('event-assist-base-year') || {}).value, 10);
  var bm = parseInt((document.getElementById('event-assist-base-month') || {}).value, 10);
  if (by && !isNaN(bm)) return '';
  return (_evtEventMonthIdx() == null)
    ? 'Set Event Period, or a Base Year and Base Month, to resolve Base Forecast.' : '';
}
/* The ONE baseline reader the Build step uses. Each branch delegates to the existing canonical owner
   for that quantity — no third copy of either lookup is created here. */
function _evtBuildBaselineForSku(sku) {
  var k = _evtBaselineKind_();
  if (k === 'manual') return null;
  if (_evtBaselineMissingInput_()) return null;
  if (k === 'growth') {
    return _evtGrowthBaseForSku((document.getElementById('event-assist-base-campaign') || {}).value || '', sku);
  }
  var by = parseInt((document.getElementById('event-assist-base-year') || {}).value, 10);
  var bm = parseInt((document.getElementById('event-assist-base-month') || {}).value, 10);
  if (by && !isNaN(bm)) return _evtBaseFcForSku(sku, bm, by);
  return _evtEventBaseFcForSku(sku);          // the event's own month, as A3-R5 resolved it
}
function _evtBuildGroups() {
  _evtCloseAllMs();
  var rows = _evtCandidateRows();
  // Preserve prior per-row user entries keyed by category||series::sku.
  var prev = {};
  _evtGroups.forEach(function(g){ (g.rows || []).forEach(function(r){ prev[g.category+'||'+g.series+'::'+String(r.sku).toUpperCase()] = r; }); });
  var byKey = {};
  // Resolved ONCE for the whole build: every row in one build shares one answer about the model, and
  // asking per row would let a mid-build change split the cards into two truths.
  var _evtModelAvail = _evtEventModelAvailable_();
  rows.forEach(function(r){
    var key = r.category + '||' + r.series;
    if (!byKey[key]) byKey[key] = { category: r.category, series: r.series, discountPct: NaN, rows: [] };
    if (byKey[key].rows.some(function(x){ return String(x.sku).toUpperCase() === String(r.sku).toUpperCase(); })) return;
    var p = prev[key + '::' + String(r.sku).toUpperCase()];
    var be = _evtBaseEventForSku(r.sku);
    byKey[key].rows.push({
      sku: r.sku, marketplaceSkuId: r.marketplaceSkuId, regularPrice: r.regularPrice, currency: r.currency,
      discountPct: p ? p.discountPct : NaN,
      dealPrice: p ? p.dealPrice : NaN,
      // A previously previewed value wins (the operator may have chosen a different baseline in
      // Preview & Pre-fill); otherwise resolve the event month's Regular FC. `== null` and not `||`,
      // because a stored Base FC of 0 is a value and must not be re-resolved as if it were missing.
      baseFc: (p && p.baseFc != null) ? p.baseFc : _evtBuildBaselineForSku(r.sku),
      // §2/§11 — SERVER TRUTH IS RE-RESOLVED, NEVER INHERITED. A previously typed New Event FC is the
      // operator's and is preserved above; the ids and the version belong to the sheet, so a rebuild
      // takes them again rather than carrying a token that may already have been superseded.
      baseEventFc: be ? be.baseEventFc : null,
      // Carried per row so the cell never has to re-derive it, and so a row built while the model was
      // readable keeps saying so if a later rebuild finds it is not.
      baseEventFcUnknown: !_evtModelAvail,
      eventFcId: be ? be.eventFcId : '',
      campaignSkuLineId: be ? be.campaignSkuLineId : '',
      rowVersion: be ? be.rowVersion : '',
      newFc: p ? p.newFc : NaN
    });
  });
  _evtGroups = Object.keys(byKey).map(function(k){ return byKey[k]; })
    .sort(function(a,b){ return (a.category+a.series).localeCompare(b.category+b.series); });
  _evtRenderGroupCards();
  _evtSetPreviewEnabled(_evtGroups.length > 0);   // #5: Preview enabled only after cards exist
}

// Render group cards — one ROW per scoped SKU (SKU · Regular · Discount% · Deal · Base FC ·
// New Event FC · Diff · state). Forecast editability is method-aware: Manual = editable New Event FC
// input; Growth/Adjust = read-only computed value.
function _evtRenderGroupCards() {
  var wrap = document.getElementById('event-group-cards');
  if (!wrap) return;
  if (!_evtGroups.length) { wrap.innerHTML = '<p class="fc-hint">No matching SKUs for the selected scope + category/series. Adjust the selection and click Build.</p>'; return; }
  var method = _evtAssistMethod();
  var editable = (method === 'manual');
  wrap.innerHTML = _evtGroups.map(function(g, i){
    // Group currency = distinct non-empty pricing_list currencies across the card's SKU rows.
    var curSet = {}; g.rows.forEach(function(r){ if (r.currency) curSet[r.currency] = 1; });
    var curs = Object.keys(curSet);
    var curBadge = (curs.length === 1)
      ? '<span class="fc-evt-cur-badge" title="pricing_list currency for this group">' + curs[0] + '</span>'
      : (curs.length > 1 ? '<span class="fc-evt-cur-badge fc-evt-warn" title="SKUs in this group use different pricing_list currencies — no cross-currency aggregate">MIXED CURRENCY</span>' : '');
    var head =
      '<div class="fc-evt-card-head">' +
        '<span class="fc-evt-tag">' + (g.category || '—') + '</span>' +
        '<span class="fc-evt-tag">' + (g.series || '—') + '</span>' +
        curBadge +
        '<label class="fc-evt-card-disc">Discount % <input type="number" min="0" max="100" step="0.1" value="' + (isNaN(g.discountPct) ? '' : g.discountPct) + '" onchange="_evtCardDiscount(' + i + ',this.value)"></label>' +
        '<button type="button" class="fc-evt-row-remove" title="Remove group" onclick="_evtRemoveGroup(' + i + ')">×</button>' +
      '</div>';
    var colHead = '<div class="fc-evt-line fc-evt-line--head"><span>SKU</span><span>Regular</span><span>Disc %</span><span>Deal</span><span>'
      + _evtBaselineLabel_() + '</span><span title="The value this event already has stored in fc_special_events">Base Event FC</span>'
      + '<span>New Event FC</span><span>Diff</span><span></span></div>';
    var baseKind = _evtBaselineKind_(), baseNote = _evtBaselineMissingInput_();
    var body = g.rows.map(function(r, ri){
      // Regular + Deal share the SAME pricing_list currency; shown as an auxiliary suffix (never a cross-country substitute).
      var cur = r.currency ? (' <small class="fc-evt-cur">' + r.currency + '</small>') : '';
      var regTxt = (r.regularPrice == null) ? '<span class="fc-evt-warn">Missing</span>' : (r.regularPrice + cur);
      var base = (r.baseFc == null) ? null : r.baseFc;
      var diff = (!isNaN(r.newFc) && base != null) ? (r.newFc - base) : null;
      var diffTxt = (diff == null) ? '—' : ((diff > 0 ? '+' : '') + diff.toLocaleString());
      var diffColor = (diff == null) ? '#94a3b8' : (diff > 0 ? '#0f766e' : (diff < 0 ? '#dc2626' : '#64748b'));
      var newCell = editable
        ? '<input type="number" min="0" class="evt-line-fc" value="' + (isNaN(r.newFc) ? '' : r.newFc) + '" onchange="_evtLineField(' + i + ',' + ri + ',\'newFc\',this.value)">'
        : '<span class="evt-line-ro">' + (isNaN(r.newFc) ? '—' : r.newFc.toLocaleString()) + '</span>';
      return '<div class="fc-evt-line">' +
        '<span class="fc-evt-line-sku" title="' + r.sku + '">' + r.sku + ' <a onclick="_evtRemoveGroupSku(' + i + ',\'' + String(r.sku).replace(/'/g,"\\'") + '\')">×</a></span>' +
        '<span>' + regTxt + '</span>' +
        '<input type="number" min="0" max="100" step="0.1" class="evt-line-disc" value="' + (isNaN(r.discountPct) ? '' : r.discountPct) + '" onchange="_evtLineField(' + i + ',' + ri + ',\'discountPct\',this.value)">' +
        '<input type="number" step="0.01" class="evt-line-deal" value="' + (isNaN(r.dealPrice) ? '' : r.dealPrice) + '" onchange="_evtLineField(' + i + ',' + ri + ',\'dealPrice\',this.value)">' +
        '<span' + (baseNote ? (' class="fc-evt-warn" title="' + baseNote + '"') : '') + '>'
          + (base != null ? base.toLocaleString() : (baseNote ? 'set input' : (baseKind === 'manual' ? 'n/a' : '—')))
          + '</span>' +
        // §4 — the persisted current value, distinct from both the computational baseline and the
        // proposed new one. A stored 0 prints 0; no persisted event prints an em dash; and a model that
        // could not be read prints NEITHER, because both of those are claims about the data.
        (r.baseEventFcUnknown
          ? '<span class="evt-line-ro fc-evt-warn" title="The stored event forecast could not be read, so this is not known to be empty. Nothing has been changed.">?</span>'
          : '<span class="evt-line-ro" title="Currently stored for this event">'
            + (r.baseEventFc == null ? '—' : r.baseEventFc.toLocaleString()) + '</span>') +
        newCell +
        '<span style="color:' + diffColor + '">' + diffTxt + '</span>' +
        '<span></span>' +
      '</div>';
    }).join('');
    return '<div class="fc-evt-card"><div class="fc-evt-card-lines">' + head + colHead + body + '</div></div>';
  }).join('');
}
// A card's Discount % (group-level) → set every row's discount + recompute its deal price.
function _evtCardDiscount(i, val) {
  var g = _evtGroups[i]; if (!g) return;
  var pct = (val === '' ? NaN : parseFloat(val));
  g.discountPct = pct;
  g.rows.forEach(function(r){
    r.discountPct = pct;
    // Deal Price uses the SAME pricing_list currency as its Regular Price (per-row) — no FX, no site guess.
    if (!isNaN(pct) && r.regularPrice != null) r.dealPrice = _evtRoundMoney(r.regularPrice * (1 - pct / 100), r.currency);
  });
  _evtRenderGroupCards();
}
// Edit one row field (discountPct → recompute deal; dealPrice / newFc direct).
function _evtLineField(gi, ri, field, val) {
  var g = _evtGroups[gi]; if (!g || !g.rows[ri]) return;
  var r = g.rows[ri];
  var num = (val === '' ? NaN : parseFloat(val));
  r[field] = num;
  if (field === 'discountPct' && !isNaN(num) && r.regularPrice != null) {
    r.dealPrice = _evtRoundMoney(r.regularPrice * (1 - num / 100), r.currency);
  }
  _evtRenderGroupCards();
}
function _evtRemoveGroup(i) { _evtGroups.splice(i, 1); _evtRenderGroupCards(); _evtSetPreviewEnabled(_evtGroups.length > 0); }
function _evtRemoveGroupSku(i, sku) {
  var g = _evtGroups[i]; if (!g) return;
  g.rows = g.rows.filter(function(r){ return String(r.sku).toUpperCase() !== String(sku).toUpperCase(); });
  if (!g.rows.length) _evtGroups.splice(i, 1);
  _evtRenderGroupCards();
  _evtSetPreviewEnabled(_evtGroups.length > 0);
}

// Discount %: apply the top-level Discount % to every row in every card (deal = regular×(1−d/100)).
function _evtApplyDiscount() {
  var pct = parseFloat((document.getElementById('event-discount-pct') || {}).value);
  if (isNaN(pct) || pct < 0 || pct > 100) { alert('Enter a Discount % between 0 and 100.'); return; }
  if (!_evtGroups.length) { alert('Build the group cards first.'); return; }
  var site = _evtSelectedSite();
  _evtGroups.forEach(function(g){
    g.discountPct = pct;
    g.rows.forEach(function(r){ r.discountPct = pct; if (r.regularPrice != null) r.dealPrice = _evtRoundMoney(r.regularPrice * (1 - pct / 100), site.currency); });
  });
  _evtRenderGroupCards();
}

// ---- Forecast method helpers ----
function _evtSetAssistHelp(msg, color) {
  var el = document.getElementById('event-assist-help');
  if (el) { el.textContent = msg || ''; el.style.color = color || '#64748B'; el.style.display = msg ? '' : 'none'; }
}
// Active method: 'growth' | 'adjust' | 'manual'.
function _evtAssistMethod() {
  return (document.getElementById('event-assist-method') || {}).value || 'growth';
}
// Show/hide method-specific inputs; re-render cards so forecast editability matches the method.
function _evtToggleAssistFields() {
  var method = _evtAssistMethod();
  var growthRow = document.getElementById('event-assist-growth-row');        // Base Campaign + Growth Rate
  var basePeriodRow = document.getElementById('event-assist-base-period-row'); // Base Year + Base Month
  var adjustRow = document.getElementById('event-assist-adjust-row');        // Adjustment type + value
  if (growthRow) growthRow.style.display = (method === 'growth') ? '' : 'none';
  if (basePeriodRow) basePeriodRow.style.display = (method === 'adjust') ? '' : 'none';
  if (adjustRow) adjustRow.style.display = (method === 'adjust') ? '' : 'none';
  var lbl = document.getElementById('event-assist-adjust-label');
  var type = (document.getElementById('event-assist-adjust-type') || {}).value || 'percent';
  if (lbl) lbl.textContent = (type === 'fixed') ? 'Adjustment (± units)' : 'Adjustment %';
  // Clear the OTHER method's inputs so a stale value can't leak into the next preview/save.
  if (method !== 'growth') { var g = document.getElementById('event-assist-growth'); if (g) g.value = ''; }
  if (method !== 'adjust') { var av = document.getElementById('event-assist-adjust-value'); if (av) av.value = ''; }
  if (method === 'growth') _evtPopulateBaseCampaigns();   // scoped Base Campaign candidates
  if (_evtGroups.length) _evtRenderGroupCards();          // toggle read-only vs editable New Event FC
}
// Render the per-SKU preview table (SKU · Base FC · New Event FC · Difference). PREVIEW ONLY.
function _evtRenderAssistPreview(rows) {
  var box = document.getElementById('event-assist-preview');
  if (!box) return;
  if (!rows || !rows.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  var html = '<table class="fc-assist-preview-table"><thead><tr>' +
    '<th>Category</th><th>Series</th><th>SKU</th><th>Base FC</th><th>New Event FC</th><th>Difference</th></tr></thead><tbody>' +
    rows.map(function(r){
      var hasBase = (r.base != null);
      var diff = (hasBase && r.newQty != null) ? (r.newQty - r.base) : null;
      var sign = (diff != null && diff > 0) ? '+' : '';
      var color = (diff == null) ? '#94a3b8' : (diff > 0 ? '#0f766e' : (diff < 0 ? '#dc2626' : '#64748b'));
      var baseCell = hasBase ? r.base.toLocaleString() : ('<span class="fc-evt-warn">' + (r.note || 'No Base FC') + '</span>');
      return '<tr><td>' + (r.category || '—') + '</td><td>' + (r.series || '—') + '</td><td>' + r.sku + '</td>' +
        '<td>' + baseCell + '</td>' +
        '<td>' + (r.newQty == null ? '<span class="fc-evt-warn">Skip</span>' : r.newQty.toLocaleString()) + '</td>' +
        '<td style="color:' + color + '">' + (diff == null ? '—' : sign + diff.toLocaleString()) + '</td></tr>';
    }).join('') + '</tbody></table>';
  box.innerHTML = html;
  box.style.display = '';
}
// Preview & Pre-fill (validation stage, PREVIEW-ONLY — never writes DB). Base source by method:
//   growth : base = Σ Base Campaign fc_special_events.fc_qty for the SKU; newFc = round(base × (1+g%))
//   adjust : base = fc_regular_forecast[Base Year][Base Month] for the SKU; percent/fixed adjustment
//   manual : no calc — user edits New Event FC per SKU; preview echoes current values
// A SKU with no base is SKIPPED (New Event FC blank / "No Base Campaign FC" / "No Base Forecast") —
// never written as 0.
function _evtApplyForecastAssist() {
  if (_evtMode() !== 'batch') { alert('Preview applies to Category / Series (Group Cards) mode.'); return; }
  if (!_evtGroups.length) { alert('Build the group cards first.'); return; }
  var method = _evtAssistMethod();

  var compute, baseFor, noBaseLabel = '';
  if (method === 'growth') {
    var campaignId = (document.getElementById('event-assist-base-campaign') || {}).value || '';
    if (!campaignId) { alert('Select a Base Campaign.'); return; }
    var growth = parseFloat((document.getElementById('event-assist-growth') || {}).value);
    if (isNaN(growth)) { alert('Enter a Growth Rate %.'); return; }
    baseFor = function(sku){ return _evtGrowthBaseForSku(campaignId, sku); };
    compute = function(b){ return Math.round(b * (1 + growth / 100)); };
    noBaseLabel = 'No Base Campaign FC';
  } else if (method === 'adjust') {
    var baseYear = parseInt((document.getElementById('event-assist-base-year') || {}).value, 10);
    var baseMonthIdx = parseInt((document.getElementById('event-assist-base-month') || {}).value, 10);
    if (!baseYear) { alert('Enter a Base Year.'); return; }
    if (isNaN(baseMonthIdx)) { alert('Select a Base Month.'); return; }
    var type = (document.getElementById('event-assist-adjust-type') || {}).value || 'percent';
    var val = parseFloat((document.getElementById('event-assist-adjust-value') || {}).value);
    if (isNaN(val)) { alert('Enter an Adjustment value.'); return; }
    baseFor = function(sku){ return _evtBaseFcForSku(sku, baseMonthIdx, baseYear); };
    compute = (type === 'fixed')
      ? function(b){ return Math.max(0, Math.round(b + val)); }
      : function(b){ return Math.max(0, Math.round(b * (1 + val / 100))); };
    noBaseLabel = 'No Base Forecast';
  } else { compute = null; baseFor = null; }   // manual

  var preview = [], filled = 0, missingBase = 0;
  _evtGroups.forEach(function(g){
    g.rows.forEach(function(r){
      var base = baseFor ? baseFor(r.sku) : null;
      r.baseFc = base;
      var newQty;
      if (compute) {
        if (base == null) { missingBase++; newQty = null; r.newFc = NaN; }
        else { newQty = compute(base); r.newFc = newQty; filled++; }
      } else {
        newQty = isNaN(r.newFc) ? null : r.newFc;   // manual echoes the current editable value
      }
      preview.push({ category: g.category, series: g.series, sku: r.sku, base: base, newQty: newQty,
        note: (compute && base == null) ? noBaseLabel : '' });
    });
  });
  _evtRenderAssistPreview(preview);
  _evtRenderGroupCards();

  if (method === 'manual') {
    _evtSetAssistHelp('Manual Entry: edit New Event FC per SKU below. Blank = skip that SKU. Nothing is written until you click Save.', '#0f766e');
  } else if (missingBase) {
    _evtSetAssistHelp('Pre-filled ' + filled + ' SKU(s). ' + missingBase + ' SKU(s) have ' + noBaseLabel + ' — skipped (New Event FC blank, never fabricated 0). Save will skip them. Nothing is written until Save.', '#b45309');
  } else {
    _evtSetAssistHelp('Previewed & pre-filled New Event FC for ' + filled + ' SKU(s). Review Base FC → New → Difference before Save — nothing is written until you click Save.', '#0f766e');
  }
}

/* ==============================================================================================
   FC-SUMMARY-R2B-A3-R7 §6/§7 — THE WINDOW IS THE IDENTITY, SO CHANGING IT IS NOT AN EDIT.

   A campaign's window is a SHARED HEADER. campaigns holds start_date/end_date once, and many
   campaign_sku_lines and many fc_special_events link to that one campaign_id — campaign_sku_lines
   carries no dates of its own at all. So moving one SKU's event to a different window by editing the
   dates on the loaded event would ask to repoint a header that other SKUs are sitting on.

   The server already refuses that: a save quoting campaign_id with a changed window is answered
   CAMPAIGN_IDENTITY_MISMATCH, with 'a campaign's site, type or event window is never silently
   repointed — create the new window as its own campaign'. What the operator got was that refusal
   after a round trip, with no statement of which window they had changed it from.

   So the first Save after a window change writes NOTHING and says so here, before any stage runs,
   showing both windows. The two offered actions are the two the current contracts define: put the
   saved window back, or detach from the loaded event and save the new window as its own event.

   WHAT IS DELIBERATELY NOT OFFERED is the third thing — moving the existing line and event to a new
   campaign while preserving their lineage. That is a real product operation and no canonical spec
   defines it: nothing says whether the event keeps its event_fc_id, whether the old campaign is left
   empty, or what happens to unrelated SKUs. It is reported as a decision, not guessed at. */
/* FC-SUMMARY-R2B-A3-R9 §4 — THE WINDOW IS EDITABLE, BEHIND AN EXPLICIT CONFIRMATION.

   A3-R8 blocked a window change outright and offered to save the new window as a SECOND event. Under
   the uniqueness rule frozen in §10.1 that second event may not exist, so the offer is withdrawn and
   the dates become editable instead. The checkbox is the confirmation: unchanged dates never need it,
   a changed window without it writes nothing at all, and with it the SAME logical event moves.

   It moves by REASSIGNMENT, never by mutating the campaign header. A header can be shared by many SKU
   lines and its window is its identity, so editing it in place would silently move every sibling SKU's
   event - which is why the server refuses it outright. Instead stage 1 resolves the header for the NEW
   window (quoting no campaign_id, so an existing one is reused with zero writes), and stages 2 and 3
   carry the EXISTING campaign_sku_line_id and event_fc_id across to it. The lineage moves with the
   event; the old header and every sibling on it are untouched, including when it is left empty. */
function _evtWindowConfirmEl_() {
  return (typeof document === 'undefined') ? null : document.getElementById('event-window-confirm');
}
function _evtWindowConfirmChecked_() { var el = _evtWindowConfirmEl_(); return !!(el && el.checked); }
function _evtWindowKey_(s, e) { return _trStrTok_(s) + ' → ' + _trStrTok_(e); }
/* Has the operator changed the window of a LOADED event? Independent of whether they confirmed it. */
function _evtWindowChanged_(startDate, endDate) {
  if (!_evtEditingActive_()) return false;
  var o = _evtEditing_ || {};
  if (!_trStrTok_(o.startDate) && !_trStrTok_(o.endDate)) return false;
  return _evtWindowKey_(o.startDate, o.endDate) !== _evtWindowKey_(startDate, endDate);
}
/* A confirmed move is in flight: stage 1 must NOT quote the loaded campaign_id, because the header it
   names is the OLD window's and quoting it asks the server to repoint that header. */
function _evtWindowEditActive_(startDate, endDate) {
  return _evtWindowChanged_(startDate, endDate) && _evtWindowConfirmChecked_();
}
function _evtWindowChangeGate_(startDate, endDate) {
  if (!_evtWindowChanged_(startDate, endDate)) return { blocked: false, code: '' };
  if (_evtWindowConfirmChecked_()) return { blocked: false, code: 'CONFIRMED' };
  var o = _evtEditing_ || {};
  return { blocked: true, code: 'EVENT_WINDOW_CHANGE_REQUIRES_CONFIRMATION',
    oldStart: _trStrTok_(o.startDate), oldEnd: _trStrTok_(o.endDate),
    newStart: _trStrTok_(startDate), newEnd: _trStrTok_(endDate),
    from: _evtWindowKey_(o.startDate, o.endDate), to: _evtWindowKey_(startDate, endDate),
    campaignId: _trStrTok_(o.campaignId) };
}
/* FC-SUMMARY-R2B-A3-R10 §10.2 — ONE FUNCTION OWNS THE PERIOD CONTROLS.

   Derived from the two facts that actually decide it — is a saved event loaded, and has its period
   change been confirmed — and from nothing else. Every entry point that can change either fact calls
   this; no other function writes to these elements. That is the property, and it is what makes "the
   dates cannot be hidden by choosing a country, a mode or an assist method" true by construction
   rather than by six coincidences.

     NEW EVENT       dates always visible and required; no confirmation tick, because there is no
                     saved period to confirm a change to.
     EXISTING, OFF   dates hidden; the saved period is stated in words; an ordinary forecast edit
                     needs none of it, and a hidden control carries no authority over the save.
     EXISTING, ON    dates visible, PREFILLED with the saved window, and labelled as new ones. */
function _evtFmtDay_(v) {
  var s = _trStrTok_(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').join('/') : (s || '—');
}
function _evtSavedWindowText_() {
  var o = _evtEditing_ || {};
  return _evtFmtDay_(o.startDate) + ' → ' + _evtFmtDay_(o.endDate);
}
function _evtSyncPeriodUi_() {
  if (typeof document === 'undefined') return;
  var editing = _evtEditingActive_();
  var confirmed = editing && _evtWindowConfirmChecked_();
  var showDates = !editing || confirmed;

  var periodRow = document.getElementById('event-period-row');
  if (periodRow) periodRow.style.display = showDates ? '' : 'none';

  var confirmRow = document.getElementById('event-window-confirm-row');
  if (confirmRow) confirmRow.hidden = !editing;

  var help = document.getElementById('event-window-confirm-help');
  if (help) {
    help.textContent = editing
      ? (confirmed
          ? ('Saved period ' + _evtSavedWindowText_() + '. Enter the new dates below.')
          : ('Saved period ' + _evtSavedWindowText_() + '. Tick to change it.'))
      : '';
  }
  /* The labels say which dates these are. On a saved event they are the NEW ones, and saying so is
     what stops the prefilled saved window reading as a field the operator has already filled in. */
  var sl = document.getElementById('event-start-date-label');
  if (sl) sl.textContent = confirmed ? 'New Start Date *' : 'Event Start Date *';
  var el = document.getElementById('event-end-date-label');
  if (el) el.textContent = confirmed ? 'New End Date *' : 'Event End Date *';
}

/* Ticking reveals the saved window to edit; UNTICKING is an abandon, not merely a hidden field. A
   period left half-typed behind an unticked box would otherwise be refused by the save gate for a
   change the operator had already decided against. */
function _evtOnWindowConfirmToggle_() {
  if (!_evtWindowConfirmChecked_()) {
    var o = _evtEditing_ || {};
    var sd = document.getElementById('event-start-date'); if (sd) sd.value = _trStrTok_(o.startDate);
    var ed = document.getElementById('event-end-date'); if (ed) ed.value = _trStrTok_(o.endDate);
    _evtClearWindowChangeNotice_();
    _evtClearPeriodError();
  }
  _evtSyncPeriodUi_();
}
// the inline handler the markup names
function _evtOnWindowConfirmToggle() { _evtOnWindowConfirmToggle_(); }

/* Put the saved window back — the loaded event is unchanged and the next Save is an ordinary edit. */
function _evtRestoreLoadedWindow_() {
  var o = _evtEditing_ || {};
  var sd = document.getElementById('event-start-date'); if (sd) sd.value = _trStrTok_(o.startDate);
  var ed = document.getElementById('event-end-date'); if (ed) ed.value = _trStrTok_(o.endDate);
  var cb = _evtWindowConfirmEl_(); if (cb) cb.checked = false;
  _evtClearWindowChangeNotice_();
  _evtSyncPeriodUi_();   // the tick was just cleared; the controls follow it
  if (typeof _evtBuildGroups === 'function' && _evtGroups.length) _evtBuildGroups();
}
function _evtClearWindowChangeNotice_() {
  var h = (typeof document === 'undefined') ? null : document.getElementById('event-window-change-notice');
  if (h) { h.innerHTML = ''; h.hidden = true; }
}
function _evtShowWindowChangeNotice_(gate) {
  var h = (typeof document === 'undefined') ? null : document.getElementById('event-window-change-notice');
  /* §9 — what was written, what to do, and nothing about where the rows live. The old wording spent
     two of its four sentences on identity, forecast ids and campaigns. */
  var text = 'Nothing was saved. This event runs ' + gate.from + ' and the form now says ' + gate.to
    + '. To move it, tick \u201cChange the event period\u201d and save again — only this event moves,'
    + ' and every other SKU keeps its own dates.';
  if (!h) { alert(text); return; }
  h.innerHTML = '';
  var p = document.createElement('div'); p.textContent = text; h.appendChild(p);
  var b1 = document.createElement('button');
  b1.type = 'button'; b1.className = 'fc-btn fc-btn--cancel'; b1.style.marginTop = '8px';
  b1.textContent = 'Keep ' + gate.from;
  b1.onclick = function () { _evtRestoreLoadedWindow_(); };
  h.appendChild(b1);
  h.hidden = false;
}
/* FC-SUMMARY-R2B-B1-PERF §15.6 / §10 — THE BATCH RESULT CLASSIFIER.

   THE ONE THING THAT MUST NOT BE READ NAIVELY: the batch answers `success: true` when it RAN, not
   when everything committed. A row can be refused individually — a stale version, an unlocatable
   row, a duplicate identity, a validation fault — while its neighbours commit. The per-SKU loop this
   replaces stopped at the first refusal, so "it returned" and "it all saved" used to be the same
   fact. They are not any more, and reporting the top-level flag as success would turn a partial save
   into a silent one, which is strictly worse than the slow loop it replaces.

   Results are POSITIONAL: `results[i]` belongs to `rows[i]` belongs to `lines[i]`. The server sends
   `index` as well, and where it does that is preferred over position — but a result whose index
   disagrees with its slot is not quietly trusted, because attributing one SKU's outcome to another
   is how an operator is told the wrong row failed. */
var EVT_ROW_ = { CREATED: 'created', UPDATED: 'updated', UNCHANGED: 'unchanged', REFUSED: 'refused' };
/* The typed reasons the server can refuse ONE row with. Mapped to a stable vocabulary so the UI never
   matches on server prose, and so an unrecognised reason is reported as itself rather than as a
   guess. */
var EVT_REFUSAL_KIND_ = {
  STALE_SPECIAL_EVENT_VERSION: 'stale',
  SPECIAL_EVENT_NOT_FOUND: 'not_found',
  DUPLICATE_SPECIAL_EVENT_IDENTITY: 'duplicate',
  missing_campaign_id: 'validation',
  missing_sku_or_scope_id: 'validation',
  missing_event_name: 'validation',
  invalid_fc_qty: 'validation'
};
function _evtRefusalKind_(reason) {
  var r = _trStrTok_(reason);
  return Object.prototype.hasOwnProperty.call(EVT_REFUSAL_KIND_, r) ? EVT_REFUSAL_KIND_[r] : 'other';
}
function _evtClassifyBatch_(env, lines) {
  var out = { ok: false, transport: false, created: 0, updated: 0, unchanged: 0, refused: 0,
              written: 0, rows: [], refusedRows: [], zeroWrite: false, partial: false,
              indexMismatch: false };
  if (!env || typeof env !== 'object') return out;                 // nothing readable came back
  if (env.success === false) { out.error = env.error || ''; return out; }
  out.transport = true;
  var data = env.data || {};
  var results = Array.isArray(data.results) ? data.results : [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i] || {};
    /* Prefer the server's own index; fall back to position ONLY when it is absent. A result that
       claims a different slot is recorded as a mismatch rather than applied to this row. */
    var r = null;
    for (var j = 0; j < results.length; j++) {
      if (results[j] && results[j].index === i) { r = results[j]; break; }
    }
    if (!r) {
      r = results[i] || null;
      if (r && r.index !== undefined && r.index !== i) { out.indexMismatch = true; r = null; }
    }
    var rec = { index: i, sku: l.sku, fcQty: l.fcQty,
                campaignSkuLineId: l.campaignSkuLineId || '',
                eventFcId: (r && r.event_fc_id) || l.eventFcId || '',
                rowVersion: (r && r.row_version) || '' };
    if (!r) {
      rec.state = EVT_ROW_.REFUSED; rec.kind = 'no_result';
      rec.reason = 'NO_RESULT_FOR_ROW';
      rec.detail = 'The server returned no result for this SKU.';
    } else if (r.skipped) {
      rec.state = EVT_ROW_.REFUSED;
      rec.reason = _trStrTok_(r.reason);
      rec.kind = _evtRefusalKind_(r.reason);
      rec.detail = _trStrTok_(r.detail);
      rec.currentRowVersion = _trStrTok_(r.current_row_version);
    } else if (r.created) { rec.state = EVT_ROW_.CREATED; }
    else if (r.unchanged) { rec.state = EVT_ROW_.UNCHANGED; }
    else { rec.state = EVT_ROW_.UPDATED; }
    if (rec.state === EVT_ROW_.CREATED) out.created++;
    else if (rec.state === EVT_ROW_.UPDATED) out.updated++;
    else if (rec.state === EVT_ROW_.UNCHANGED) out.unchanged++;
    else { out.refused++; out.refusedRows.push(rec); }
    out.rows.push(rec);
  }
  out.written = out.created + out.updated;
  out.partial = out.refused > 0 && (out.written > 0 || out.unchanged > 0);
  out.zeroWrite = out.written === 0 && out.refused === 0 && out.unchanged > 0;
  out.ok = out.refused === 0;
  return out;
}
/* What the operator is told when some rows committed and some did not. It names every refused SKU
   and says plainly what DID land, because "save failed" over a batch that wrote four of five rows is
   the sentence that makes the next action wrong. */
/* §11 — CARRY EACH COMMITTED ROW’S NEW IDENTITY BACK INTO THE FORM.

   `event_fc_id` and `row_version` are what the NEXT save must quote. After a partial result the
   operator is looking at a form where some rows are saved and some are not, and the saved ones now
   hold versions the server has moved on from. Without this, saving again refuses every row that just
   succeeded with STALE_SPECIAL_EVENT_VERSION — a refusal this page would have manufactured itself.

   Only server-supplied values are written back. A row the server refused keeps exactly what it had,
   because inventing an id for it is the one thing that would let a refused row look saved. */
function _evtApplyBatchReceipts_(cls) {
  if (!cls || !cls.rows || typeof document === 'undefined') return 0;
  var wrap = document.getElementById('event-sku-rows');
  var domRows = wrap ? Array.prototype.slice.call(wrap.children) : [];
  var n = 0;
  cls.rows.forEach(function (r) {
    if (r.state === EVT_ROW_.REFUSED) return;
    var el = domRows[r.index];
    if (!el || !el.dataset) return;
    if (r.eventFcId) { el.dataset.eventFcId = r.eventFcId; n++; }
    if (r.rowVersion) el.dataset.rowVersion = r.rowVersion;
    if (r.campaignSkuLineId) el.dataset.campaignSkuLineId = r.campaignSkuLineId;
    /* The loaded-event session is the other holder of this identity, and the two must not diverge:
       _evtSingleRowIdentity_ prefers the hydrated session while editing. */
    if (_evtEditingActive_() && _evtEditing_ && _evtEditing_.lines) {
      var key = String(r.sku || '').toUpperCase();
      if (_evtEditing_.lines[key]) {
        if (r.eventFcId) _evtEditing_.lines[key].eventFcId = r.eventFcId;
        if (r.rowVersion) _evtEditing_.lines[key].rowVersion = r.rowVersion;
      }
    }
  });
  return n;
}
function _evtPartialText_(cls) {
  var lines2 = [];
  lines2.push('Saved ' + cls.written + ' of ' + cls.rows.length + ' SKU(s).'
    + (cls.unchanged ? (' ' + cls.unchanged + ' already matched what is stored.') : ''));
  lines2.push('');
  lines2.push(cls.refused + ' SKU(s) were NOT saved:');
  cls.refusedRows.forEach(function (r) {
    var why = r.kind === 'stale' ? 'changed since this form was opened'
      : r.kind === 'not_found' ? 'no longer exists'
      : r.kind === 'duplicate' ? 'already has an event for this flag and year'
      : r.kind === 'validation' ? 'was rejected as incomplete'
      : 'was refused';
    lines2.push('  • ' + r.sku + ' — ' + why + ' (' + (r.reason || 'no reason given') + ')');
  });
  lines2.push('');
  lines2.push('The rows above are still in the form. Check the latest data before saving them again '
    + '— do not re-save the whole set, the rows that landed would be written twice.');
  return lines2.join('\n');
}

// ================= Save (campaigns → campaign_sku_lines → fc_special_events) =================
// Complete idempotent 3-layer transaction. On live: writes campaigns → campaign_sku_lines →
// fc_special_events in order; if any step fails, stops and reports the real error (never fake
// success, never fc_special_events without a parent campaign line). Demo ON → in-memory illustration.
async function saveEventUpdate() {
  var site = _evtSelectedSite();
  var country = site.country || (document.getElementById('event-country') || {}).value || '';
  var mkey = _fcResolveMarketplaceKey(site.marketplace);
  var company = site.company || '';
  var eventFlag = (document.getElementById('event-name-input') || {}).value || 'Normal';
  var eventStartDate = ((document.getElementById('event-start-date') || {}).value || '').trim();
  var eventEndDate = ((document.getElementById('event-end-date') || {}).value || '').trim();
  /* FC-SUMMARY-R2B-A3-R10 §10.2 — THE FORM IS STILL READ HERE, DELIBERATELY.

     It is tempting to substitute the saved window whenever the tick is off, since the inputs are then
     hidden. That would SWALLOW a changed period instead of refusing it, and A3-R9 §8 requires the
     refusal: a changed window without the confirmation writes nothing at all and states both windows.
     Silently saving under the old dates is the worse of the two failures, because the operator is told
     the save succeeded.

     What keeps a hidden field from carrying a stale edit is `_evtOnWindowConfirmToggle_`, which puts
     the saved window back the moment the tick is cleared — so an unticked form does not HOLD a
     different window. If the two ever diverge anyway, that is a real state and the gate below is
     exactly what it is for. */
  var eventPeriod = _evtComposePeriod(eventStartDate, eventEndDate);
  var monthIdx = _evtEventMonthIdx();
  var mode = _evtMode();

  if (!country || !site.marketplace) { alert('Country and Marketplace are required.'); return; }

  if (eventFlag === 'Normal') {
    alert('Event Flag is "Normal" — no campaign / special-event forecast is created.\n\n' +
      'Baseline demand is covered by the regular monthly forecast (fc_regular_forecast).');
    closeFcModal();
    return;
  }
  var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
  if (!demoOn && !company) { alert('Select a Marketplace (company scope) — company could not be resolved. KM and ResUS are separate scopes.'); return; }
  if (!eventStartDate || !eventEndDate) { alert('Event Start Date and Event End Date are required for a non-Normal event.'); _evtShowPeriodError('Event Start Date and Event End Date are required.'); return; }
  if (!_evtValidatePeriod()) { alert('Event Start Date must be on or before Event End Date.'); return; }
  var targetYear = parseInt(eventStartDate.slice(0, 4), 10) || parseInt((document.getElementById('event-target-year') || {}).value, 10);
  if (!targetYear) { alert('Target Year is required.'); return; }

  // A3-R9 §4 — BEFORE ANY STAGE RUNS. A period change on a loaded event is allowed but never silent:
  // without the explicit confirmation this writes nothing at all — not the campaign, not a line, not
  // an event — and states both windows.
  var _winGate = _evtWindowChangeGate_(eventStartDate, eventEndDate);
  if (_winGate.blocked) { _evtShowWindowChangeNotice_(_winGate); return; }
  _evtClearWindowChangeNotice_();
  var _winEdit = _evtWindowEditActive_(eventStartDate, eventEndDate);

  // ---- Collect + validate SKU lines from the active mode ----
  // line: { sku, marketplaceSkuId, category, series, regularPrice, dealPrice, discountPercent, fcQty }
  var lines = [];
  if (mode === 'single') {
    var rows = _evtReadSingleRows();
    if (!rows.length) { alert('Add at least one SKU row.'); return; }
    if (rows.length > _evtRowCap_()) { alert('Maximum ' + EVT_MAX_ROWS + ' SKU rows.'); return; }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.sku) { alert('Row ' + (i + 1) + ': SKU is required.'); return; }
      if (r.priceState === 'out_of_scope' || !r.marketplaceSkuId) { alert('Row ' + (i + 1) + ' (' + r.sku + '): SKU is not in the selected Company / Country / Marketplace scope (marketplace_sku_id unresolved).'); return; }
      if (r.priceState === 'missing_price' || r.regularPrice == null) { alert('Row ' + (i + 1) + ' (' + r.sku + '): MISSING_PRICING_LIST_ROW — no pricing_list price for company=' + company + ' / country=' + country + ' / marketplace=' + mkey + ' / marketplace_sku_id=' + (r.marketplaceSkuId || '(unresolved)') + ' / sku=' + r.sku + '. Set the price in pricing_list before saving (never substituted with 0).'); return; }
      if (!r.currency) { alert('Row ' + (i + 1) + ' (' + r.sku + '): MISSING_PRICING_LIST_ROW currency — the pricing_list row has no currency; cannot snapshot price_units.'); return; }
      if (isNaN(r.dealPrice)) { alert('Row ' + (i + 1) + ' (' + r.sku + '): Deal Price is required.'); return; }
      if (isNaN(r.fcQty) || r.fcQty <= 0) { alert('Row ' + (i + 1) + ' (' + r.sku + '): Forecast Qty is required (> 0).'); return; }
      var meta = _fcDeriveSkuMeta(r.sku);
      var disc = isNaN(r.discountPercent) ? (r.regularPrice > 0 ? Math.round((1 - r.dealPrice / r.regularPrice) * 1000) / 10 : 0) : r.discountPercent;
      // A3-R8 §3 — the row's identity is re-resolved against the window this form states, never
      // inherited from a window the operator has left.
      var rid = _evtSingleRowIdentity_(r);
      lines.push({ sku: r.sku, marketplaceSkuId: r.marketplaceSkuId, category: meta.category, series: meta.series,
        regularPrice: r.regularPrice, dealPrice: r.dealPrice, discountPercent: disc, currency: r.currency, fcQty: r.fcQty,
        eventFcId: rid.eventFcId, campaignSkuLineId: rid.campaignSkuLineId, rowVersion: rid.rowVersion });
    }
  } else {
    if (!_evtGroups.length) { alert('Build the group cards first.'); return; }
    var skipped = 0;
    for (var gi = 0; gi < _evtGroups.length; gi++) {
      var g = _evtGroups[gi];
      for (var ri = 0; ri < g.rows.length; ri++) {
        var gr = g.rows[ri];
        var tag = (g.category || '—') + ' / ' + (g.series || '—') + ' / ' + gr.sku;
        // Blank / no-base New Event FC = SKIP that SKU (not an error, never written as 0).
        if (isNaN(gr.newFc) || gr.newFc <= 0) { skipped++; continue; }
        // Hard errors only for SKUs that DO have a forecast to write.
        if (!gr.marketplaceSkuId) { alert(tag + ': marketplace_sku_id unresolved (out of scope).'); return; }
        if (gr.regularPrice == null) { alert(tag + ': MISSING_PRICING_LIST_ROW — no pricing_list price for company=' + company + ' / country=' + country + ' / marketplace=' + mkey + ' / marketplace_sku_id=' + (gr.marketplaceSkuId || '(unresolved)') + ' / sku=' + gr.sku + ' (never substituted with 0).'); return; }
        if (!gr.currency) { alert(tag + ': MISSING_PRICING_LIST_ROW currency — the pricing_list row has no currency; cannot snapshot price_units.'); return; }
        if (isNaN(gr.dealPrice)) { alert(tag + ': Deal Price is required.'); return; }
        var meta2 = _fcDeriveSkuMeta(gr.sku);
        var disc2 = isNaN(gr.discountPct) ? (gr.regularPrice > 0 ? Math.round((1 - gr.dealPrice / gr.regularPrice) * 1000) / 10 : 0) : gr.discountPct;
        lines.push({ sku: gr.sku, marketplaceSkuId: gr.marketplaceSkuId, category: meta2.category, series: meta2.series,
          regularPrice: gr.regularPrice, dealPrice: gr.dealPrice, discountPercent: disc2, currency: gr.currency, fcQty: gr.newFc,
          // §2 — THE THREE FIELDS THAT WERE MISSING. Without them the stage-3 payload quoted no version
          // for a row the server could still resolve, and 14_'s gate refused it as stale. They are the
          // same three the single-row path has always sent.
          eventFcId: gr.eventFcId || '', campaignSkuLineId: gr.campaignSkuLineId || '',
          rowVersion: gr.rowVersion || '' });
      }
    }
    if (!lines.length) { alert('No SKU lines to save — every card row is blank / has no base forecast (all skipped).'); return; }
    if (skipped && !confirm(skipped + ' SKU(s) have no New Event FC and will be SKIPPED. Save the remaining ' + lines.length + ' SKU(s)?')) return;
  }

  // A3-R9 §2 — THE CREATE PREFLIGHT. One event flag, one target year, one scoped SKU = one event, so a
  // NEW event may only author SKUs that have none. Conflicting rows are never skipped so the rest can
  // save: a partial save of an authored set is a silently different set. One refusal, every conflict
  // named, and not a single stage begun. An EXISTING event is exempt — it addresses the row it loaded.
  if (!_evtEditingActive_()) {
    var _dupCtx = { company: company, country: country, marketplace: mkey, eventFlag: eventFlag,
      year: targetYear };
    var _dupHits = _evtDuplicateConflicts_(lines.map(function (l) { return l.sku; }), _dupCtx);
    // BASE-EVENT-FC-READINESS §C/§E — null = THE READ MODEL IS UNAVAILABLE, AND THAT NOW REFUSES HERE.
    //
    // It used to fall through deliberately, on the reasoning that the server's guard is the authority and
    // would answer with the rows it can see. That reasoning is still true and nothing below weakens it —
    // 14_'s fcSeUniquenessConflict_ remains the authority and is untouched. What it got wrong is the
    // OUTCOME it left the operator with: every Base Event FC on screen had already printed as though
    // those SKUs had no stored event, so the save it allowed was one the operator had been shown false
    // grounds for, and its only possible ending was a stage-1 refusal that reads as a server fault.
    //
    // Refusing here is not a second uniqueness rule. It is the page declining to send a payload it knows
    // it could not preflight, naming why, and writing nothing. The existing Retry path reloads the one
    // authoritative read that is missing; no request is issued from here.
    if (_dupHits === null) {
      alert('Nothing was written.' + String.fromCharCode(10) + String.fromCharCode(10) +
        'The existing Special Events could not be read, so this save cannot be checked against them' +
        ' — the "Currently stored" column is showing ? rather than a value for that reason.' +
        String.fromCharCode(10) + String.fromCharCode(10) +
        'Close the builder and open it again to reload them, then retry. Nothing has been changed.');
      return;
    }
    if (_dupHits.length) { alert(_evtDuplicateRefusalText_(_dupHits, _dupCtx)); return; }
  }

  var marketplaceId = _evtResolveMarketplaceId(site);
  var eventMonth = (monthIdx == null) ? '' : (monthIdx + 1);   // fc_special_events.event_month (1–12)

  var campaignPayload = {
    campaign_name: eventFlag + ' ' + targetYear, company: company, marketplace_id: marketplaceId,
    country: country, marketplace: mkey, promotion_type: eventFlag, event_flag: eventFlag,
    major_event_flag: eventFlag, year: targetYear, start_date: eventStartDate, end_date: eventEndDate,
    event_period: eventPeriod, status: 'active', source: 'fc_summary_builder'
  };
  // §5/§6 — EDITING names the campaign and quotes the version it was loaded at. A NEW save quotes
  // nothing, which is exactly what makes the server able to refuse it if the window already exists:
  // a versionless save can never land on a row the operator has not seen.
  //
  // A3-R9 §4 — EXCEPT DURING A CONFIRMED PERIOD CHANGE. The loaded campaign_id names the header for
  // the OLD window, and that header may be shared with other SKUs; quoting it here would ask the
  // server to repoint it, which it refuses (CAMPAIGN_IDENTITY_MISMATCH) and which would move every
  // sibling's event if it did not. Quoting nothing instead makes stage 1 resolve the header for the
  // NEW window by HEADER_IDENTITY_KEY — reused with zero writes if it exists, created if it does not —
  // and stages 2 and 3 then carry this event's own ids across to it.
  if (_evtEditingActive_() && !_winEdit) {
    campaignPayload.campaign_id = _evtEditing_.campaignId;
    campaignPayload.expected_row_version = _evtEditing_.campaignVersion;
  }

  // ---- Demo ON → in-memory illustration only ----
  if (demoOn) {
    lines.forEach(function(l){
      fcEventMock.push({ sku: l.sku, year: targetYear, company: company, marketplace: mkey,
        country: country, category: l.category, series: l.series, event: eventFlag,
        eventPeriod: eventPeriod, fcQty: l.fcQty });
    });
    renderFcEventTable();
    closeFcModal();
    alert('DEMO (in-memory only): ' + lines.length + ' fc_special_events row(s) illustrated. campaigns (1) + campaign_sku_lines (' + lines.length + ') would be written in live mode.');
    return;
  }

  // ---- Live → complete idempotent 3-layer write. Any failure stops + reports honestly. ----
  var DB = window.KM && window.KM.DB;
  // B1-PERF §15.6 — stage 3 now calls the BATCH writer, so that is the one whose absence must stop
  // the save. Naming a function this path no longer uses would let a build without the batch writer
  // pass the guard and fail at stage 3, with stages 1 and 2 already committed.
  if (!DB || !DB.upsertCampaign || !DB.upsertCampaignSkuLines || !DB.importFcSpecialEventsBatch) {
    alert('Save failed: campaign writers are not available in this build (upsertCampaign / upsertCampaignSkuLines / importFcSpecialEventsBatch). Nothing was written.');
    return;
  }
  // FC-SUMMARY-R1 — shared single-flight latch; the button guard it already had is kept.
  if (!_fcWriteBegin_('eventBuilder')) return;
  var _ebEpoch = _fcEpoch_();
  var saveBtn = document.getElementById('fc-event-builder-save-btn')
    || document.querySelector('#fc-add-event-modal .fc-btn--primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  // FC-SUMMARY-R2B-A — the partial-write manifest. `_fcEbStage_` is the stage currently in flight and
  // `_fcEbCommitted_` is what the server has already confirmed, so a refusal can state exactly what exists
  // rather than leaving the operator to infer it.
  _fcEbStage_ = 'stage 1 — campaigns'; _fcEbCommitted_ = [];
  try {
    // 1) campaign header (idempotent by campaign_id, else business key).
    var camp = await DB.upsertCampaign(campaignPayload);
    var campaignId = (camp && camp.campaign_id) || '';
    if (!campaignId) throw new Error('campaign_id was not returned by the campaigns writer.');
    _fcEbCommitted_.push('campaigns'); _fcEbStage_ = 'stage 2 — campaign_sku_lines';

    // 2) campaign_sku_lines (idempotent per line).
    var linePayloads = lines.map(function(l){
      // price_units = the SAME pricing_list row's currency snapshot (never re-guessed from country at save).
      return { campaign_sku_line_id: l.campaignSkuLineId || '',
        marketplace_sku_id: l.marketplaceSkuId, sku: l.sku, regular_price: l.regularPrice,
        deal_price: l.dealPrice, discount_percent: l.discountPercent, price_units: l.currency,
        line_status: 'active', source: 'fc_summary_builder' };
    });
    var lineRes = await DB.upsertCampaignSkuLines({ campaign_id: campaignId, lines: linePayloads });
    var lineIdBySku = {};
    ((lineRes && lineRes.lines) || []).forEach(function(x){ if (x && x.sku) lineIdBySku[String(x.sku).toUpperCase()] = x.campaign_sku_line_id; });
    _fcEbCommitted_.push('campaign_sku_lines');
    /* STAGE2-LARGE-BATCH §3.G — STAGE 3 MAY NOT RUN ON A LINE NOTHING RESOLVED.

       Every fc_special_events row is addressed by campaign_id + campaign_sku_line_id, and the id comes
       from stage 2's receipt. The fallback below it was `l.campaignSkuLineId || ''` — so a SKU the stage-2
       response did not mention would have gone to stage 3 carrying an EMPTY id, and been written against
       a line that does not exist. That is the one thing a partial-commit recovery can never repair
       afterwards, because the orphan looks exactly like a legitimate row.

       The handler emits one receipt per input line, so this should never fire. It is here because
       'should never' is not the same as 'cannot', and the cost of being wrong is an orphan row. It
       refuses through the SAME staged-failure surface every other stage uses — `_fcEbCommitted_` already
       says campaigns and campaign_sku_lines are committed, so the operator is told exactly what exists
       and gets the existing reconcile action rather than a second recovery workflow. No request is
       issued here and nothing is retried. */
    var _unresolved = lines.filter(function (l) {
      return !(lineIdBySku[String(l.sku).toUpperCase()] || l.campaignSkuLineId);
    }).map(function (l) { return l.sku; });
    if (_unresolved.length) {
      throw new Error('stage 2 acknowledged the write but returned no campaign_sku_line_id for '
        + _unresolved.length + ' SKU(s): ' + _unresolved.slice(0, 8).join(', ')
        + (_unresolved.length > 8 ? ', …' : '')
        + '. Stage 3 was NOT started, so no event row was written against a line that may not exist.');
    }
    _fcEbStage_ = 'stage 3 — fc_special_events';

    // 3) fc_special_events per line, linked by campaign_id + campaign_sku_line_id. The BACKEND owns
    //    event_fc_id (canonical PK) — the frontend does NOT fabricate it. Idempotency is the stable
    //    business key campaign_id + campaign_sku_line_id, so a double-click / retry updates the SAME
    //    row (no duplicate) and preserves its event_fc_id.
    /* B1-PERF §15.6 — ONE REQUEST, NOT N.

       This loop issued one logical write per SKU: a 20-SKU event cost 22 requests and the operator
       watched them go one at a time. `importFcSpecialEventsBatch` already existed, already ran on the
       canonical write transport, and already delegated to `fcSpecialEventUpsert_` — the SAME core the
       single-row action calls. So every A3 guard (the uniqueness refusal, the expected_row_version
       gate, the unchanged short-circuit, the event_fc_id preservation) is inherited by construction
       rather than re-implemented here, and no new routed action is introduced.

       THE PAYLOAD PER ROW IS UNCHANGED, deliberately: the batch handler passes each row straight to
       the same upsert, so anything different here would be a second dialect of one contract. */
    var evRows = lines.map(function (l) {
      var lineId = lineIdBySku[String(l.sku).toUpperCase()] || l.campaignSkuLineId || '';
      var evPayload = {
        campaign_id: campaignId, campaign_sku_line_id: lineId,
        company: company, country: country, marketplace: mkey, marketplace_id: marketplaceId,
        scope_type: 'sku', scope_id: l.sku, sku: l.sku, series: l.series, category: l.category,
        event_name: eventFlag, event_period: eventPeriod, event_start_date: eventStartDate,
        event_end_date: eventEndDate, event_month: eventMonth, year: targetYear, fc_qty: l.fcQty,
        source: 'campaign_sync', note: 'FC Summary Special Event Builder'
      };
      // §6 — the canonical PK travels with the edit. Omitting it here is what let a re-save of an
      // existing event reach the create branch on any sheet whose business key had drifted.
      if (l.eventFcId) evPayload.event_fc_id = l.eventFcId;
      if (l.rowVersion) evPayload.expected_row_version = l.rowVersion;
      return evPayload;
    });
    var evEnv = await DB.importFcSpecialEventsBatch(evRows, { actor: 'fc_summary_builder' });
    var evCls = _evtClassifyBatch_(evEnv, lines);
    if (!evCls.transport) {
      throw new Error((evEnv && evEnv.error) || 'The special-event batch write did not complete.');
    }
    /* §11 — THE COMMITTED ROWS’ NEW IDENTITY IS WRITTEN BACK BEFORE ANYTHING ELSE HAPPENS.
       A row that just committed has a NEW row_version, and the form still holds the old one. If the
       operator saves again after a partial result, every previously-committed row would be refused
       STALE_SPECIAL_EVENT_VERSION — a refusal manufactured by this page, not by the data. */
    _evtApplyBatchReceipts_(evCls);
    var written = evCls.written, unchangedCount = evCls.unchanged;
    _fcWriteEnd_('eventBuilder', FC_WRITE_.SUCCESS);
    _fcReceipt_('Special Event Builder Save', written, null);
    if (!_fcOwns_(_ebEpoch)) { _fcWriteState_['eventBuilder'] = FC_WRITE_.UNMOUNTED; return; }
    // §3 — A SAVE THAT WROTE NOTHING SAYS SO. Reporting "3 events saved" for three rows the server
    // recognised as identical is a small lie that makes the zero-write guarantee unverifiable from
    // the outside, which is most of what makes it worth having.
    var zeroWrite = evCls.zeroWrite;
    /* §4 — stage 1's receipt is the COMPLETE canonical campaigns row, read back from the sheet after
       the write by `campaignReceiptFor_`. Handing it over means the campaigns table is reconciled
       rather than re-read: it is current because it was updated. The other two tables carry no such
       row and are named to nobody, so they are refreshed once, inside this save. */
    _fcAfterWriteScoped_({ slice: FC_SLICE_.EVENTS,
                           receiptRows: { campaigns: (camp && camp.row) ? [camp.row] : null } }, function () {
      if (typeof renderFcEventTable === 'function') renderFcEventTable();
      /* §11 — A PARTIAL RESULT KEEPS THE FORM OPEN. Closing it would discard the inputs of exactly
         the rows that still need attention, and the operator would have nothing to act on but a
         sentence. The committed rows now carry their new versions, so the refused ones can be saved
         again on their own without re-writing the rows that landed. */
      if (evCls.partial || (evCls.refused > 0 && evCls.written === 0 && evCls.unchanged === 0)) {
        alert(_evtPartialText_(evCls));
        return;
      }
      closeFcModal();
      if (zeroWrite) {
        alert('Nothing to save — every value already matches what is stored. '
          + unchangedCount + ' event(s) unchanged; no rows were written.');
        return;
      }
      alert(FC_MSG_.SAVED + ' campaigns: 1 (' + campaignId + ') · campaign_sku_lines: ' + linePayloads.length
        + ' · fc_special_events: ' + written
        + (unchangedCount ? (' (' + unchangedCount + ' unchanged, not written)') : '')
        + ' (linked by campaign_id / campaign_sku_line_id).');
    });
  } catch (e) {
    _fcBuilderFailure_(e, _ebEpoch);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}

// Check if data already exists
function checkDataExists(sku, year, monthIndex = null) {
  if (monthIndex === null) {
    // Check all months
    return fcRegularMock.some(item => item.sku === sku && item.year === year);
  } else {
    // Check specific month
    const existing = fcRegularMock.find(item => item.sku === sku && item.year === year);
    return existing && existing.months[monthIndex] !== undefined && existing.months[monthIndex] !== 0;
  }
}

// Save Regular Update
// Save the previewed Regular Forecast changes. Writes ONLY the Target Month of each affected SKU's
// fc_regular_forecast row (all other months preserved from the existing row). Blank Manual = Skip.
// Live: idempotent bulk upsert via importFcRegularForecastBatch (business key year|company|country|
// marketplace|sku; preserves forecast_id). Demo: in-memory only, clearly labeled.
function saveRegularUpdate() {
  if (!_regularPreview || !_regularPreview.rows.length) { alert('Click Preview first to review changes before saving.'); return; }
  var P = _regularPreview;
  var monthKey = REG_MONTH_KEYS[P.targetMonth];
  var monthLbl = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][P.targetMonth];
  var manual = P.method === 'manual';
  var box = document.getElementById('regular-preview');
  function up(v){ return String(v==null?'':v).trim().toUpperCase(); }

  // Manual: read the current New inputs (blank = Skip; 0 = explicit zero).
  var manualVals = {};
  if (manual && box) {
    box.querySelectorAll('.reg-prev-new').forEach(function(inp){
      var idx = parseInt(inp.dataset.idx, 10);
      var raw = String(inp.value).trim();
      manualVals[idx] = (raw === '') ? null : Math.max(0, Math.round(Number(raw) || 0));
    });
  }

  // Scope guard — every row must still match the selected site (defends against a stale preview).
  var site = _regularSelectedSite();
  var toWrite = [];
  P.rows.forEach(function(r, i){
    if (up(r.country) !== up(site.country)) return;
    var newQty = manual ? manualVals[i] : r.newQty;
    if (newQty == null) return;   // blank Manual / no computed value → Skip
    var row = { sku: r.sku, year: P.targetYear, company: r.company, country: r.country, marketplace: r.marketplace };
    // Preserve every OTHER month from the existing row; replace ONLY the target month.
    REG_MONTH_KEYS.forEach(function(m){ row[m] = (r.existing[m] === '' || r.existing[m] == null) ? '' : r.existing[m]; });
    row[monthKey] = newQty;
    toWrite.push(row);
  });

  if (!toWrite.length) { alert('Nothing to save — every row is blank (Skip) or out of scope.'); return; }

  // ---- Live (Demo OFF): idempotent bulk upsert. ----
  if (typeof _fcUseDb === 'function' && _fcUseDb()) {
    if (!(window.KM && window.KM.DB && window.KM.DB.importFcRegularForecastBatch)) { alert('Regular forecast write API is not available.'); return; }
    if (!_fcWriteBegin_('regular')) return;        // FC-SUMMARY-R1: extra clicks add zero logical writes
    _setRegularSaveEnabled(false);
    var _rgOpts = { ctl: 'regular', op: 'Regular Forecast Save', rows: toWrite.length, epoch: _fcEpoch_(),
      reenable: _setRegularSaveEnabled,
      onSuccess: function (s) {
        _fcAfterWriteScoped_(FC_SLICE_.REGULAR, function () {
          renderFcRegularTable();
          closeFcModal();
          alert(FC_MSG_.SAVED + ' Regular Forecast — ' + monthLbl + ' ' + P.targetYear + ' (only this month updated).\n' +
            'Rows written: ' + toWrite.length + _fcCountsLine_(s));
        });
      } };
    window.KM.DB.importFcRegularForecastBatch(toWrite, { forecastStatusDefault: 'draft', sourceDefault: 'fc_summary_builder' })
      .then(function(res){ _fcSettleWrite_(res, _rgOpts); })
      .catch(function(err){ _fcFailWrite_(err, _rgOpts); });
    return;
  }

  // ---- Demo (in-memory only) — updates ONLY the target month, preserving others. ----
  toWrite.forEach(function(w){
    var t = fcRegularMock.find(function(i){ return up(i.sku)===up(w.sku) && String(i.year)===String(w.year) &&
      up(i.company)===up(w.company) && up(i.country)===up(w.country) && up(i.marketplace)===up(w.marketplace); });
    if (!t) { t = { sku: w.sku, year: w.year, company: w.company, country: w.country, marketplace: w.marketplace, category: '', series: '', months: [0,0,0,0,0,0,0,0,0,0,0,0] }; fcRegularMock.push(t); }
    t.months[P.targetMonth] = Number(w[monthKey]) || 0;
  });
  renderFcRegularTable();
  closeFcModal();
  alert('Regular Forecast — DEMO (in-memory only, NOT written to DB).\n' +
    monthLbl + ' ' + P.targetYear + ' updated for ' + toWrite.length + ' SKU(s) (only this month).');
}

// (Removed dead saveNewEvent — superseded by the Special Event Builder v2 saveEventUpdate;
//  it referenced obsolete single-field element IDs that no longer exist in the modal.)






// ========================================
// Demo Data Layer: Phase 3C - FC Summary Mapping
// ========================================
function _getDemoFcRegularData() {
    var rows = window.KM.DemoData.getFcSummaryRows({});
    return rows.map(function(r) {
        var monthVal = r.regular_forecast || 0;
        return {
            sku: r.sku,
            year: 2026,
            company: 'ResTW',
            marketplace: r.marketplace || 'Amazon',
            country: r.country || 'US',
            category: r.category || '',
            series: r.series || '',
            months: [monthVal, monthVal, monthVal, monthVal, monthVal, monthVal,
                     monthVal, monthVal, monthVal, monthVal, monthVal, monthVal]
        };
    });
}

function _getDemoFcEventData() {
    var rows = window.KM.DemoData.getFcSummaryRows({});
    return rows.filter(function(r) { return r.event_forecast > 0; }).map(function(r) {
        return {
            sku: r.sku,
            year: 2026,
            company: 'ResTW',
            marketplace: r.marketplace || 'Amazon',
            country: r.country || 'US',
            category: r.category || '',
            series: r.series || '',
            event: 'Prime Day',
            eventPeriod: '2026/07/15-2026/07/16',
            fcQty: r.event_forecast || 0
        };
    });
}

function _showFcSummaryDemoBadge() {
    var section = document.getElementById('fc-summary-section');
    if (!section) return;
    if (section.querySelector('.demo-badge')) return;
    var h2 = section.querySelector('h2');
    if (!h2) return;
    var badge = document.createElement('span');
    badge.className = 'demo-badge';
    badge.style.cssText = 'background:#8b5cf6;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:12px;vertical-align:middle;';
    badge.textContent = 'Demo Data Mode';
    h2.appendChild(badge);
}

function _removeFcSummaryDemoBadge() {
    var badge = document.querySelector('#fc-summary-section .demo-badge');
    if (badge) badge.remove();
}

// Patch initFcSummaryPage to show/hide badge
var _origInitFcSummaryPage = window.initFcSummaryPage;
window.initFcSummaryPage = function() {
    _origInitFcSummaryPage();
    if (window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled()) {
        _showFcSummaryDemoBadge();
    } else {
        _removeFcSummaryDemoBadge();
    }
};

// Debug helper
window.debugFcSummaryDemoData = function() {
    var enabled = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
    console.log('=== FC Summary Demo Data Debug ===');
    console.log('Demo enabled:', enabled);
    if (!enabled) { console.log('Demo mode is OFF. Use setDemoDataMode(true) to enable.'); return; }
    var rows = window.KM.DemoData.getFcSummaryRows({});
    console.log('DemoData fcSummary rows:', rows.length);
    var mapped = _getDemoFcRegularData();
    console.log('Mapped FC Regular rows:', mapped.length);
    var events = _getDemoFcEventData();
    console.log('Mapped FC Event rows:', events.length);
    console.log('--- First 5 raw rows ---');
    console.table(rows.slice(0, 5));
    console.log('--- First 10 mapped regular rows ---');
    console.table(mapped.slice(0, 10));
};

// ========================================
// Cloud (Demo OFF) DB connection: fc_regular_forecast
// ========================================

// ----------------------------------------------------------------------------------------------------------
// F1-7G · scoped FC Summary workspace read cutover (mirrors the F1-7B/7C/7D/7F pattern)
// The FC Summary PRIMARY render (Regular / Special-Event / Target-Rule tables + the Year dropdown + the
// non-cascading filter universes) sources fc_regular_forecast / fc_special_events / fc_target_rules /
// marketplaces from ONE scoped `fcSummary` workspace — NO broad Operation DB for the primary render.
// Kill switch: KM.api.setWorkspaceEnabled('fcSummary', false) → instant Legacy broad-cache. Canonical default ON.
// The page's SECONDARY builder/import modals still read the broad cache (marketplace_skus / sku_details /
// campaigns / pricing_list), lazily loaded ONLY when such a modal opens — the primary render never depends on it.
// The Special Event WRITE path (incl. Event Assist) is UNCHANGED here — its browser-computed forecast authority is
// flagged separately as EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED (a deferred, separately-authorized redesign).
// ----------------------------------------------------------------------------------------------------------
function _fcEffectiveWorkspace() {
  return !!(window.KM && window.KM.api && typeof window.KM.api.workspaceApiActive === 'function' &&
    window.KM.api.workspaceApiActive('fcSummary'));
}
var _fcReadModel = null;   // workspace-sourced { fcRegularForecast, fcSpecialEvents, fcTargetRules, marketplaces } or null = Legacy
var _fcCandidateYears_ = null;   // Year options derived from the candidate BEFORE it became the read model
var _fcReadSeq = 0;

/* ==============================================================================================
   FC-SUMMARY-R3-R1 §C — SLICES, AND THE REQUESTS THAT STOPPED BEING ISSUED.

   WHAT THE MEASUREMENT SAID, BECAUSE IT DECIDES THIS DESIGN. A production request that names no
   action, opens no spreadsheet and returns 0.2 KB costs a median 6.3 seconds. Opening the database
   and reading a two-row sheet adds 0.5 s. The 496-row table and its 197 KB add 1.2 s. The fixed cost
   of ASKING is five times the cost of the largest table, so the lever is not a smaller payload — it is
   fewer requests. Two measured facts follow from that and both are load-bearing here:

     1. Two requests fired TOGETHER cost 4.5 s where two fired in sequence cost 10 s. Bootstrap and the
        active tab are therefore issued in the same tick. A bootstrap followed by a lazy slice would pay
        two platform floors and be slower than the single request it replaced.
     2. Route re-entry used to re-read 221.6 KB although unmount() keeps the model and the page was
        already holding every row it was about to ask for again. That read is simply gone.

   FRESHNESS IS PER SLICE, NOT PER PAGE. A slice that failed must not erase a slice that succeeded, and
   the page must be able to say which of the two it is showing. UNREAD / LOADING / CURRENT / STALE /
   REFUSED are per slice, and STALE only ever means 'this data is real and older than we would like'. */
var FC_SLICE_ = { BOOTSTRAP: 'bootstrap', REGULAR: 'regular', EVENTS: 'events', RULES: 'rules' };
var FC_FRESH_ = { UNREAD: 'UNREAD', LOADING: 'LOADING', CURRENT: 'CURRENT', STALE: 'STALE', REFUSED: 'REFUSED' };
var _FC_TAB_SLICE_ = { regular: FC_SLICE_.REGULAR, event: FC_SLICE_.EVENTS, target: FC_SLICE_.RULES };
/* Which model keys a slice OWNS. bootstrap owns three, which is why activating the Target Rules tab on a
   cold mount issues ONE request rather than two: the rules arrive with the bootstrap that had to happen
   anyway, and they are small enough that not carrying them would be the odd choice. */
var _FC_SLICE_KEYS_ = {
  // Target Rules and marketplaces only. Special Events are deliberately NOT here and not in the server's
  // bootstrap either: Target Rules gate a CONTROL — the modal may not assert NEW until an authoritative
  // read has proved no matching rule exists — while Special Events gate nothing, and fetching a tab
  // nobody has opened is the eager read this round exists to remove. The two lists have to agree; if this
  // one claims a key bootstrap does not send, the model is never considered usable and every route
  // re-entry re-fetches, which is the defect this round came to fix.
  bootstrap: ['fcTargetRules', 'marketplaces'],
  regular: ['fcRegularForecast'],
  events: ['fcSpecialEvents'],
  rules: ['fcTargetRules']
};
var _FC_MODEL_KEYS_ = ['fcRegularForecast', 'fcSpecialEvents', 'fcTargetRules', 'marketplaces'];
var _fcSliceState_ = {};
/* FC-SUMMARY-R2B-A3-R10 §14.1/§14.2 — THE MODEL AND THE LEDGER ARE ONE FACT, SO THEY ARE RESET
   TOGETHER.

   `_fcReadModel` holds the data and `_fcSliceState_` describes it, and a refusal used to write only
   the first. The consequence was reproducible and silent: Regular lands, bootstrap times out, the
   refusal nulls the model, and the Regular record is left saying CURRENT about rows that no longer
   exist. Retry asks only for what the ledger calls failed, so it fetched bootstrap alone, the banner
   cleared, and the Regular table drew EMPTY with no error at all — the one thing the slice contract
   exists to forbid, since unread is not empty. Only navigating away and back recovered it.

   Two writes that must be kept in step are a bug waiting for the next caller to forget one. This is
   the single operation instead, and `_fcRenderError_` is its only caller.

   THE GENERATION is the other half. A merge is a COMMIT into shared state, and the page checked
   ownership at the DRAW, one step too late — a request issued before the reset could still write its
   answer into the model the reset had just emptied. The generation is captured at dispatch and
   checked immediately before the commit, so a superseded answer is dropped rather than merged. */
var _fcModelGen_ = 0;
function _fcModelGenNow_() { return _fcModelGen_; }
function _fcInvalidateModel_(reason) {
  _fcReadModel = null;          // fail closed — NEVER fall back to the broad cache for the primary render
  _fcCandidateYears_ = null;    // the year list belongs to the model; a refusal must not outlive it
  _fcSliceState_ = {};          // and nothing may still claim to describe what was just discarded
  _fcModelGen_++;               // answers already in flight belong to the model that no longer exists
  _fcInvalidateReason_ = String(reason || 'READ_REFUSED');
  return _fcModelGen_;
}
var _fcInvalidateReason_ = '';
function _fcSliceRec_(n) {
  if (!_fcSliceState_[n]) _fcSliceState_[n] = { state: FC_FRESH_.UNREAD, observedAt: null, flight: null, loads: 0, err: null, gen: 0 };
  if (_fcSliceState_[n].gen === undefined) _fcSliceState_[n].gen = 0;
  return _fcSliceState_[n];
}

/* ============================================================================================
   S3-R1 §C — A READBACK MUST BE NEWER THAN THE WRITE IT CONFIRMS.

   _fcSliceFetch_ opens with `if (rec.flight) return rec.flight;`, which is the right thing for a
   READ: two tabs asking for the same slice should share one request. It is the wrong thing for a
   POST-WRITE READBACK, because the flight it joins may have been dispatched BEFORE the write, and
   the server computed that answer from the rows as they were. The joined promise then resolves
   successfully, the readback commits it, the view state is set to CURRENT and the banner is
   cleared — so the operator is told the view is current while looking at a table that does not
   contain what they just saved. No error is raised anywhere, because nothing failed.

   It needs a slow backend and a save issued while the tab's own first read is still in the air,
   which is exactly the shape of a live demonstration and exactly the shape no unit test had.

   So the post-write path RELEASES the joinable flight for that slice before it reads (see
   _fcPostWriteRefresh_), which makes the next call dispatch instead of join. The released flight is
   still in the air, and it is stopped from landing by per-slice request identity — `rec.gen`, a
   counter compared at the commit, never a timestamp. The older answer is dropped with the same typed
   marker §14.2 already uses, so it cannot overwrite the newer one.

   THE RULE LIVES AT THE WRITE, NOT IN THE FETCHER. "May I join?" is a question about what the caller
   knows, and only the post-write path knows that an answer computed a moment ago is now out of date.
   Giving _fcSliceFetch_ an option would have put that knowledge in the wrong place and given every
   future caller a switch to get wrong; the fetcher stays single-flight for reads, unconditionally.
   ============================================================================================ */
function _fcSliceStates_() {
  var o = {}; Object.keys(_fcSliceState_).forEach(function (k) { o[k] = _fcSliceState_[k].state; }); return o;
}
/* Workspace mode AND live data. Legacy (kill switch off) and Demo keep every path they had. */
function _fcWorkspaceMode_() {
  var live = (typeof _fcUseDb !== 'function') || _fcUseDb();
  return live && (typeof _fcEffectiveWorkspace === 'function') && _fcEffectiveWorkspace();
}
/* A model key is KNOWN only when it is actually an array on the model. Absent means unread, and the
   whole point of the slice contract is that unread is not empty. */
function _fcHas_(key) { return !!(_fcReadModel && Array.isArray(_fcReadModel[key])); }
function _fcSliceHasData_(name) {
  var keys = _FC_SLICE_KEYS_[name] || [];
  for (var i = 0; i < keys.length; i++) { if (!_fcHas_(keys[i])) return false; }
  return keys.length > 0;
}
/* Enough of the model to DRAW. The bootstrap keys plus whichever tab is active — not all four, because
   demanding the Regular rows to render the Target Rules tab is how a page ends up waiting for 197 KB it
   is not going to show. */
function _fcModelUsable_(tab) {
  if (!_fcReadModel) return false;
  if (!_fcSliceHasData_(FC_SLICE_.BOOTSTRAP)) return false;
  var want = _FC_TAB_SLICE_[tab || _fcTabNow_()] || FC_SLICE_.REGULAR;
  return _fcSliceHasData_(want);
}
function _fcTabNow_() {
  try { return (typeof _fcActiveTab === 'function') ? _fcActiveTab() : 'regular'; } catch (e) { return 'regular'; }
}

/* Merge a slice into the ONE model. Only keys the answer actually carried are written, so a slice can
   never blank a dataset it does not own — the failure mode that would let opening the Special Event tab
   erase the Regular rows. */
function _fcMergeSlice_(name, adapted) {
  if (!_fcReadModel) _fcReadModel = {};
  var landed = [];
  _FC_MODEL_KEYS_.forEach(function (k) {
    if (Array.isArray(adapted[k])) { _fcReadModel[k] = adapted[k]; landed.push(k); }
  });
  if (adapted.facets) _fcReadModel.facets = adapted.facets;
  if (adapted.counts) _fcReadModel.counts = adapted.counts;
  /* The Year dropdown's options. Bootstrap carries the server-derived universe (computed from every
     Regular row before the rows were dropped); a regular slice re-derives from the rows it just
     brought. Both go through the page's own ordering, so the dropdown is unchanged either way. */
  if (_fcReadModel.facets && Array.isArray(_fcReadModel.facets.years)) _fcCandidateYears_ = _fcReadModel.facets.years;
  else if (Array.isArray(_fcReadModel.fcRegularForecast)) _fcCandidateYears_ = _fcYearsOf_(_fcReadModel.fcRegularForecast);
  /* Every slice whose keys are now present is current — bootstrap satisfies events and rules too. */
  Object.keys(_FC_SLICE_KEYS_).forEach(function (sl) {
    if (_fcSliceHasData_(sl) && landed.length) {
      var owns = _FC_SLICE_KEYS_[sl].every(function (k) { return landed.indexOf(k) !== -1; });
      if (owns) { var r = _fcSliceRec_(sl); r.state = FC_FRESH_.CURRENT; r.err = null;
                  if (adapted.observedAt) r.observedAt = adapted.observedAt; }
    }
  });
  return landed;
}

/* ONE logical request per slice, ever, while one is in flight. Extra clicks and a tab switched twice
   attach to the promise that already exists rather than issuing a second read. */
function _fcSliceFetch_(name) {
  var rec = _fcSliceRec_(name);
  if (rec.flight) return rec.flight;
  var gen = _fcModelGenNow_();     // §14.2 — the model this answer will be committed into
  var myGen = ++rec.gen;           // S3-R1 §C — per-slice request identity, compared at the commit
  if (!(window.KM && window.KM.api && typeof window.KM.api.getWorkspace === 'function')) {
    return Promise.reject({ code: 'WORKSPACE_UNAVAILABLE', message: 'FC Summary Workspace API unavailable.' });
  }
  var had = _fcSliceHasData_(name);
  rec.state = FC_FRESH_.LOADING; rec.loads++; rec.err = null;
  var p = Promise.resolve(window.KM.api.getWorkspace('fcSummary', { include: { slice: name } }))
    .then(function (env) {
      if (!env || !env.success) {
        throw (env && env.errors && env.errors[0]) || { code: 'FC_SUMMARY_READ_FAILED', message: 'FC Summary workspace request failed.' };
      }
      var d = env.data || {};
      /* ONE HAZARD, TESTED DIRECTLY: a response that identifies itself as a DIFFERENT slice must never be
         installed as this one — that is tab A's answer becoming tab B's data.

         A response carrying NO slice label is not that hazard. It is a server that does not speak slices:
         the backend ships before the frontend, so an R14 page should never meet an R13 server, but a
         rollback would produce exactly that, and an R13 server ignores include.slice and answers the full
         workspace. Answering with more than was asked for is not a failure, so it is merged with whatever
         canonical arrays it carries and the page degrades to slow rather than to broken. The
         nothing-usable-came-back check below still catches a response that carried no arrays at all. */
      if (d.slice && String(d.slice) !== name) {
        throw { code: 'FC_SUMMARY_SLICE_MISMATCH',
          message: 'The server answered the ' + String(d.slice) + ' slice for a ' + name + ' request.' };
      }
      if (!(window.KM.DB && typeof window.KM.DB.adaptFcSummaryWorkspaceSlice === 'function')) {
        throw { code: 'FC_SUMMARY_ADAPTER_UNAVAILABLE', message: 'The FC Summary slice adapter is not loaded.' };
      }

      /* VALIDATE, THEN COMMIT — and in that order, because the order is the property. A bootstrap may
         legitimately carry facets and no rows, so either a canonical array or a facet set makes the
         answer readable; anything else is a successful response that cannot be read, which is a
         different fact from a failed request and is reported as one. */
      var hasFacets = !!(d.facets && typeof d.facets === 'object' && !Array.isArray(d.facets));
      if (!_fcValidWorkspaceData_(d) && !hasFacets) {
        throw { code: 'FC_SUMMARY_RESPONSE_UNREADABLE',
          message: 'The server answered successfully but the FC Summary payload was not the canonical '
            + 'workspace shape. No data was loaded and nothing was changed.' };
      }
      var adapted = window.KM.DB.adaptFcSummaryWorkspaceSlice(d);
      /* Only the keys the answer CARRIED have to adapt into arrays — a slice omits the rest by design.
         A carried key that did not survive adaptation is a model that cannot be trusted, and nothing has
         been written yet, so refusing here leaves the previous model exactly as it was. */
      var carried = _FC_MODEL_KEYS_.filter(function (k) { return d[k] !== undefined && d[k] !== null; });
      for (var ci = 0; ci < carried.length; ci++) {
        if (!Array.isArray(adapted[carried[ci]])) {
          throw { code: 'FC_SUMMARY_MODEL_UNREADABLE',
            message: 'The FC Summary payload could not be adapted into a read model. No data was loaded.' };
        }
      }
      /* No second 'carried nothing' gate here: _fcValidWorkspaceData_ above already answers false for a
         payload with no canonical table, and two gates over one fact make the first one impossible to
         test — a mutation that removes it changes nothing, which reads as a missing assertion. */
      /* §14.2 — SUPERSEDED. The model this answer was asked for has since been discarded, so
         committing it would repopulate a model the page has already reported as gone and leave the
         ledger describing a mixture of two. Dropped, and said so, rather than merged. */
      if (_fcModelGenNow_() !== gen || rec.gen !== myGen) {
        /* Two ways to be superseded, one outcome. The model generation moved (the model this answer
           was asked for has been discarded), or a NEWER REQUEST FOR THIS SLICE was dispatched — which
           is what a post-write readback does deliberately, so that a pre-write answer can never be
           the one that lands. */
        throw { code: 'FC_SUMMARY_READ_SUPERSEDED', superseded: true,
          message: 'A newer FC Summary read replaced this one; the older answer was discarded.' };
      }
      _fcMergeSlice_(name, adapted);   // THE ONLY COMMIT, and every check above has passed
      rec.state = FC_FRESH_.CURRENT; rec.err = null;
      if (adapted.observedAt) rec.observedAt = adapted.observedAt;
      return _fcReadModel;
    })
    .catch(function (err) {
      /* A REFUSAL NEVER BLANKS WHAT IS ALREADY TRUE. Data already in hand becomes STALE — real, and
         older than we would like. Only a slice with nothing behind it is REFUSED. */
      /* §14.2 — a record belonging to a discarded model describes nothing the page is showing. Marking
         it REFUSED would put a failure in the banner for a slice nobody is currently reading. */
      /* ... and a superseded answer's FAILURE is not this slice's failure either: the request that
         replaced it owns the outcome, so recording REFUSED here would put a banner on a slice a newer
         read is already answering. */
      if (_fcModelGenNow_() === gen && rec.gen === myGen) {
        rec.state = had ? FC_FRESH_.STALE : FC_FRESH_.REFUSED;
        rec.err = err || null;
      }
      throw err;
    });
  /* Clear the handle only if it is still THIS request's. A released flight (see _fcPostWriteRefresh_)
     lands after its replacement has already stored a new handle, and an unconditional `rec.flight =
     null` there would discard the live one — so the next caller would dispatch a duplicate instead of
     joining it. The generation is what distinguishes them. */
  rec.flight = p.then(function (v) { if (rec.gen === myGen) rec.flight = null; return v; },
                      function (e) { if (rec.gen === myGen) rec.flight = null; throw e; });
  return rec.flight;
}

/* The slices that are not CURRENT and have nothing behind them — what Retry must ask for, and only
   that. Retrying the whole page after one slice failed is how a 10-second request comes back. */
function _fcFailedSlices_() {
  var out = [];
  Object.keys(_fcSliceState_).forEach(function (k) {
    var r = _fcSliceState_[k];
    if (r.state === FC_FRESH_.REFUSED || r.state === FC_FRESH_.STALE) out.push(k);
  });
  return out;
}


// read-model-first accessors: Workspace mode reads the scoped DTO; Legacy reads the broad-cache getters unchanged.
function _fcGetRegularForecast() {
  if (_fcHas_('fcRegularForecast')) return _fcReadModel.fcRegularForecast;
  if (_fcWorkspaceMode_()) return [];   // unread: the region reports LOADING/REFUSED, the table draws nothing
  return (window.KM && window.KM.DB && window.KM.DB.getFcRegularForecast) ? window.KM.DB.getFcRegularForecast() : [];
}
/* R2-STABILITY §2 — "does this page have the Regular forecast yet". ONE answer, asked of whichever
   store is authoritative in this mode. Workspace: the slice has landed. Legacy: the broad cache has
   been built. A modal that gates on anything else is gating on a fact about a store it does not read. */
function _fcRegularSourceReady_() {
  if (_fcWorkspaceMode_()) return _fcHas_('fcRegularForecast');
  return !!(typeof window !== 'undefined' && window._opDbCache);
}
function _fcGetSpecialEvents() {
  if (_fcHas_('fcSpecialEvents')) return _fcReadModel.fcSpecialEvents;
  if (_fcWorkspaceMode_()) return [];
  return (window.KM && window.KM.DB && window.KM.DB.getFcSpecialEvents) ? window.KM.DB.getFcSpecialEvents() : [];
}
/* FC-SUMMARY-R3-R1 — THE FAIL-OPEN, AND THE ONE LINE THAT CLOSES IT.

   A real state-machine test proved that three different states reached the classifier as the same value:
   a successful read of a database with no matching rule, a read that FAILED, and a read that had not
   happened yet. All three answered `[]`, and `[]` means 'I looked, there are none' — which is what
   licenses NEW and twelve 100% defaults. The cause was here: when the read model was absent this fell
   through to the broad cache, and the broad cache answers `[]` when it is empty rather than refusing.

   _TR_UNAVAILABLE_ already existed and already failed closed. It was simply never reached on this path.
   In workspace mode the canonical rules now come from an authoritative read or not at all; `null` makes
   _trExistingRules_ return the unavailable sentinel, Save stays disabled and the months stay blank.
   Legacy mode is untouched — it has no workspace read to be authoritative about.

   NOTE WHAT DID NOT CHANGE. A SUCCESSFUL read that genuinely finds zero rules still returns [], still
   classifies NEW, and still fills twelve 100s. That is a proven answer and it stays a proven answer.
   Nothing in the classifier, the canonical key, hydration, the receipt merge, the fingerprint, dirty
   tracking or the R13 stale-write gate moves. */
function _fcGetTargetRules() {
  if (_fcHas_('fcTargetRules')) return _fcReadModel.fcTargetRules;
  // A model that EXISTS without this array is malformed or not yet filled: unknown either way, and it was
  // unavailable before this round too. Falling through to the broad cache from here is how a read model
  // that arrived without its rules used to classify NEW.
  if (_fcReadModel) return null;
  // No model at all. In workspace mode the canonical rules come from an authoritative read or not at all;
  // Legacy has no workspace read to be authoritative about, so it keeps the broad cache it always used.
  if (_fcWorkspaceMode_()) return null;
  return (window.KM && window.KM.DB && window.KM.DB.getFcTargetRules) ? window.KM.DB.getFcTargetRules() : [];
}
function _fcGetMarketplaces() {
  if (_fcHas_('marketplaces')) return _fcReadModel.marketplaces;
  if (_fcWorkspaceMode_()) return [];
  return (window.KM && window.KM.DB && window.KM.DB.getMarketplaces) ? window.KM.DB.getMarketplaces() : [];
}

// F1-7L: bounded scoped load for the SECONDARY builder/import modals (Regular + Special Event/Event Assist).
// They read sku_details / marketplace_skus / campaigns / pricing_list (+ fc_regular_forecast / fc_special_events /
// marketplaces) via the broad KM.DB.get*() getters. Instead of the retired whole-DB startup prime (or the old
// whole-DB lazy load), fetch ONLY these tables via the bounded getTable path (KM.DB.refreshCacheTables) — the SAME
// normalizer the broad getters use → every modal fact + the Event Assist calc inputs stay BEFORE==AFTER. The
// PRIMARY render never depends on this. Loaded once per page; _fcResetSecondaryCache() (called on any FC write)
// forces the next modal open to re-read fresh. Legacy/unconfigured → the getters degrade exactly as before.
// FC-SUMMARY-R2B-A3-R1 §7 — THE TWO BUILDERS DO NOT NEED THE SAME SEVEN TABLES.
//
// One list served both paths, so choosing Regular Forecast read `campaigns`, `pricing_list` and
// `fc_special_events` that the Regular builder never opens, and choosing Special Events read
// `fc_regular_forecast` that it does not either. Splitting the list is what makes the prefetch
// honest: the round asked for the SELECTED path's prerequisites, not for both under one name.
//
// campaign_sku_lines is new here and is not an optimisation: rehydrating an existing event needs the
// per-line deal price and discount, and that table is where they live. It rides the Special Event
// path only. The Regular path's list got shorter, not longer.
/* FC-SUMMARY-R2B-A3-R10 §14.4 — `marketplaces` IS NOT A PREREQUISITE, BECAUSE AN AUTHORITATIVE READ
   HAS ALREADY BROUGHT IT.

   It is emitted by the bootstrap slice, which every mount performs, and both stores run the SAME
   `normalizeMarketplaceRecord` with the SAME filter `normalizeOperationDb` applies — so the workspace
   array and the broad-cache array are the same rows in the same shape. Fetching it again was a second
   physical `getTable` for rows already in memory, and in production that read is what failed:
   HTTP_TRANSPORT_ERROR / getTable / marketplaces, which presented as a dead Builder on the first Next.

   The remedy is ownership, not a retry: the four Builder call sites now ask the page accessor
   `_fcGetMarketplaces()`, the same one the table itself renders from, so there is ONE answer to "what
   marketplaces are there" on this page. No second cache authority is created — the accessor reads the
   read model in Workspace mode and the broad cache in Legacy, exactly as it already did.

   `marketplace_skus` STAYS. It is not in the workspace, so nothing has read it; the difference is
   which rows an authoritative read already brought, not a preference for one path over the other. */
/* FC-SUMMARY-R2B-B1-R2-STABILITY §1/§2 — `fc_regular_forecast` IS NOT A PREREQUISITE EITHER, AND FOR
   THE SAME REASON, ONE LAYER DOWN.

   `marketplaces` was fetched twice and used once. This was fetched once and used NEVER: in Workspace
   mode `_fcGetRegularForecast()` returns the read model and does not fall through to the broad cache,
   so the rows this read brought were dropped into a store the Builder does not consult. The six call
   sites that did consult it were asking `KM.DB.getFcRegularForecast()` directly — the exact pattern
   A3-R5 §3 corrected for the Special builder's Base FC, left in place here — and they now ask the
   page accessor, so there is ONE answer to "what is this SKU's Regular FC" on this page.

   This is the REQUEST_TIMEOUT / getTable / fc_regular_forecast on Regular -> Next. The request was
   never needed, so it is removed rather than retried or given a longer budget (§6).

   `sku_details` and `marketplace_skus` STAY, by the same test that removed this one: no authoritative
   read brings them, nothing else holds them, and the Builder genuinely reads them. */
var _FC_PREREQ_TABLES_ = {
  regular: ['sku_details', 'marketplace_skus'],
  event: ['sku_details', 'marketplace_skus', 'campaigns', 'campaign_sku_lines',
          'pricing_list', 'fc_special_events']
};
// The union, kept as the reset surface and as the CSV-import/Event-Assist fallback list. Nothing
// loads it as a unit any more.
var _FC_SECONDARY_TABLES = ['sku_details', 'marketplace_skus', 'campaigns', 'campaign_sku_lines', 'pricing_list', 'fc_regular_forecast', 'fc_special_events', 'marketplaces'];
var _fcSecondaryLoaded = false;
/* Which BUILDER PATHS this page has loaded prerequisites for, in this session. Page-local on purpose:
   it answers "did I load this", which is the only question the latch can answer honestly. */
var _fcPrereqLoadedPaths_ = {};
/* FC-SUMMARY-R2B-A3-R5 §4/§5 — THE GRANULARITY THE INVALIDATION ALWAYS NEEDED.
 *
 * A3-R4 stopped a Target Rule save from throwing away the Special builder's tables, which was the
 * coarse-to-less-coarse step. What it could not fix is that a path is still all-or-nothing: a Special
 * Event save legitimately invalidates campaigns, campaign_sku_lines and fc_special_events, and because
 * the Special PATH was the unit of freshness, the four tables the save cannot touch — sku_details,
 * marketplace_skus, marketplaces, pricing_list — were discarded with them and re-read. That is the
 * seven-request 'Loading…' the operator still saw after every successful event save.
 *
 * The census is what licenses this, not an assumption: of the Special path's seven tables, a Special
 * Event write reaches exactly three. The other four are reference data that this write has no handler
 * for and cannot change.
 *
 * So freshness is recorded per table here, and the path map above is kept as the derived answer to
 * 'is this whole path warm'. Nothing is ever kept warm that a write could have changed, and nothing is
 * refetched merely because it shares a path with something that did change. The rows themselves are
 * still owned by the one broad cache — this records only which of them are known current. */
var _fcPrereqLoadedTables_ = {};
function _fcPrereqMissing_(p) {
  return (_FC_PREREQ_TABLES_[p] || []).filter(function (t) { return !_fcPrereqLoadedTables_[t]; });
}
/* S2-R4B §10 — the two halves of the table index. Registering is unconditional; releasing only clears
   entries THIS flight owns, so a later request for the same table is never dropped by an earlier one
   settling. Both are total functions over the list, because a partial registration is how a duplicate
   read gets back in. */
function _fcMarkTablesInflight_(tables, flight) {
  (tables || []).forEach(function (t) { _fcPrereqInflightTables_[t] = flight; });
}
function _fcReleaseTablesInflight_(tables, flight) {
  (tables || []).forEach(function (t) {
    if (_fcPrereqInflightTables_[t] === flight) delete _fcPrereqInflightTables_[t];
  });
}
/* The flights already fetching any of `tables`, de-duplicated. A caller waits on these instead of
   asking again; waiting on a request someone else is paying for costs nothing. */
function _fcInflightFor_(tables) {
  var out = [];
  (tables || []).forEach(function (t) {
    var f = _fcPrereqInflightTables_[t];
    if (f && out.indexOf(f) === -1) out.push(f);
  });
  return out;
}
/* FC-SUMMARY-R2B-A3-R4 §7 — INVALIDATE THE PATH THE WRITE COULD HAVE STALED, AND ONLY THAT PATH.
 *
 * This cleared BOTH builder paths after EVERY successful FC write. Saving a Target % Rule therefore
 * threw away the seven tables the Special Event builder had just loaded — tables a fc_target_rules
 * write cannot touch — so the operator testing saves saw 'Loading…' on every single Next, and paid
 * four or seven server reads for it. The scope was already being threaded through
 * `_fcAfterWriteScoped_` and simply discarded here.
 *
 * The affected paths are DERIVED from `_FC_PREREQ_TABLES_`, which is the existing declaration of what
 * each path holds — no second list, and a path that later gains a table is covered without editing
 * this function. An unrecognised or absent scope clears everything, because 'I do not know what this
 * write touched' must never be answered by keeping data warm. */
/* WHICH TABLES EACH WRITE SCOPE CHANGES. Derived from what the writers behind each slice actually
 * touch, and intersected below with _FC_PREREQ_TABLES_ to decide which builder paths can be stale.
 *   regular  fc_regular_forecast          -> only the Regular path holds it
 *   events   campaigns + campaign_sku_lines + fc_special_events -> only the Special path holds them
 *   rules    fc_target_rules              -> NEITHER path holds it, so a Target Rule save keeps both warm */
var _FC_SLICE_PREREQ_TABLES_ = {
  regular: ['fc_regular_forecast'],
  events: ['campaigns', 'campaign_sku_lines', 'fc_special_events'],
  rules: ['fc_target_rules']
};
function _fcSliceTables_(slice) {
  if (Object.prototype.hasOwnProperty.call(_FC_SLICE_PREREQ_TABLES_, slice)) return _FC_SLICE_PREREQ_TABLES_[slice];
  return null;
}
/* FC-SUMMARY-R2B-B1-R2-STABILITY §3/§4 — THE CENSUS OF WHAT A SPECIAL SAVE ACTUALLY PROVES.
 *
 * Invalidating the three tables a Special Event save touches is correct — those rows really did
 * change. What was wrong is that invalidation was the END of the story: the operator then paid for
 * the truth a SECOND time, on the next Builder open, in an Apps Script round trip that had nothing
 * to do with the save they had already waited for. That is the ~15 s block and the REQUEST_TIMEOUT /
 * getTable / campaign_sku_lines.
 *
 * Read against the writers, the three receipts are NOT equally informative:
 *
 *   campaigns            AUTHORITATIVE. `handleUpsertCampaign_` returns `row: campaignReceiptFor_(...)`
 *                        — the complete canonical row, read back from the sheet AFTER the write. Nothing
 *                        a re-read could add. Reconciled from the receipt; ZERO reads.
 *
 *   campaign_sku_lines   PARTIAL. Each line receipt carries campaign_sku_line_id + sku + created +
 *                        row_version, and no row. The page knows what it SENT, but created_at/by and
 *                        updated_at/by are server-owned and were never returned, so a row assembled
 *                        here would be a row with invented provenance.
 *
 *   fc_special_events    PARTIAL IN THE ENVELOPE. `fcSpecialEventUpsert_` computes the full row on
 *                        every branch (`row: fcSeReceiptFor_(sheet, id)`) and
 *                        `handleImportFcSpecialEventsBatch_` then pushes only {index, event_fc_id,
 *                        created, unchanged, row_version} and DROPS it. The truth exists server-side
 *                        and does not reach the client. Recorded here because it is the one change
 *                        that would take the post-write refresh below to zero reads as well — and it
 *                        is a server change, so it is named rather than assumed.
 *
 * So: reconcile what is proven, and REFRESH THE REST WHERE THE OPERATOR IS ALREADY WAITING (§4) —
 * inside the save flow, concurrently with the readback the save already performs. The operator waits
 * once, at Save, which is the moment they expect to. The next open waits for nothing.
 *
 * NOTHING INCOMPLETE IS EVER MARKED CURRENT. A table is re-latched only after an authoritative read
 * of it RESOLVED, or after a complete receipt was accepted by the store that owns the rows. A refresh
 * that fails leaves its table unlatched, and the next Builder open reads it exactly as it does today. */
function _fcReconcileFromReceipts_(scope) {
  var done = [];
  if (!scope || typeof scope !== 'object') return done;
  var rows = scope.receiptRows;
  if (!rows) return done;
  var rc = (window.KM && window.KM.DB && typeof window.KM.DB.reconcileCacheRow === 'function')
    ? window.KM.DB.reconcileCacheRow : null;
  if (!rc) return done;
  Object.keys(rows).forEach(function (table) {
    var list = rows[table];
    if (!list || !list.length) return;
    // ALL OR NOTHING PER TABLE. One row patched and one rejected leaves the table neither stale nor
    // current, and calling that current is the one thing §4 forbids by name.
    var ok = true;
    for (var i = 0; i < list.length; i++) { if (!rc(table, list[i])) { ok = false; break; } }
    if (ok) done.push(table);
  });
  return done;
}
function _fcResetSecondaryCache(scope) {
  _fcSecondaryLoaded = false;
  var slice = (scope && typeof scope === 'object') ? scope.slice : scope;
  var tables = (typeof slice === 'string') ? _fcSliceTables_(slice) : null;
  // unknown scope → assume everything; 'I do not know what this write touched' may never keep data warm
  if (!tables) { _fcPrereqLoadedPaths_ = {}; _fcPrereqLoadedTables_ = {}; return; }
  // Tables whose COMPLETE canonical row the receipt carried, and which the owning store accepted.
  // They are current because they were updated, not because they were spared.
  var reconciled = _fcReconcileFromReceipts_(scope);
  tables.forEach(function (t) { if (reconciled.indexOf(t) === -1) delete _fcPrereqLoadedTables_[t]; });
  Object.keys(_FC_PREREQ_TABLES_).forEach(function (p) {
    var holds = _FC_PREREQ_TABLES_[p].some(function (t) { return !_fcPrereqLoadedTables_[t] && tables.indexOf(t) !== -1; });
    if (holds) delete _fcPrereqLoadedPaths_[p];
  });
  return reconciled;
}

/* §4 — THE ONE IMMEDIATE SCOPED REFRESH, PAID INSIDE THE SAVE FLOW.
 *
 * Only the tables this write invalidated AND the receipts could not prove. It runs concurrently with
 * the slice readback the save already performs, so it costs the operator the slower of the two rather
 * than the sum. On success the tables are latched CURRENT and the next Builder open issues nothing;
 * on failure NOTHING is latched, no banner is raised, and the next open behaves exactly as it does
 * today — a refresh that could not run must never be able to make things worse than not running. */
function _fcPostWriteWarm_(scope) {
  var slice = (scope && typeof scope === 'object') ? scope.slice : scope;
  var tables = (typeof slice === 'string') ? _fcSliceTables_(slice) : null;
  if (!tables || !tables.length) return Promise.resolve([]);
  // Only tables a Builder path actually holds: warming a table no Builder reads would be a request
  // bought for nobody.
  var held = {};
  Object.keys(_FC_PREREQ_TABLES_).forEach(function (p) {
    _FC_PREREQ_TABLES_[p].forEach(function (t) { held[t] = 1; });
  });
  var need = tables.filter(function (t) { return held[t] && !_fcPrereqLoadedTables_[t]; });
  if (!need.length) return Promise.resolve([]);
  var rc = (window.KM && window.KM.DB && typeof window.KM.DB.refreshCacheTables === 'function')
    ? window.KM.DB.refreshCacheTables : null;
  if (!rc) return Promise.resolve([]);
  _fcMeta_.postWriteWarmStart = Date.now(); _fcMeta_.postWriteWarmEnd = null;
  _fcMeta_.postWriteWarmTables = need.slice();
  // S2-R4B §10 — ANNOUNCE THE REQUEST BEFORE AWAITING IT. A Builder reopened during this window now
  // finds the tables listed as in flight and joins this promise instead of issuing the same read again.
  var warm = Promise.resolve(rc(need)).then(function () {
    _fcReleaseTablesInflight_(need, warm);
    _fcMeta_.postWriteWarmEnd = Date.now();
    need.forEach(function (t) { _fcPrereqLoadedTables_[t] = true; });
    _fcSecondaryLoaded = true;
    // A PATH is warm only when every table it holds is warm. Derived, never asserted: the path latch
    // exists to answer "is this whole path warm", and answering it from anything but the tables is how
    // a Builder opens over a table nobody fetched.
    Object.keys(_FC_PREREQ_TABLES_).forEach(function (p) {
      if (!_fcPrereqMissing_(p).length) _fcPrereqLoadedPaths_[p] = true;
    });
    return need;
  }, function () {
    // The index entry goes on failure too, and it goes FIRST. A table left marked in flight after the
    // request that owned it has died would make the next reopen wait on a dead promise instead of
    // asking — a duplicate read is wasteful, but a join to nothing is a permanent Loading.
    _fcReleaseTablesInflight_(need, warm);
    _fcMeta_.postWriteWarmEnd = Date.now();
    // Deliberately silent and deliberately empty-handed. The WRITE succeeded and has already been
    // reported; a warm-up failure is not news the operator can act on, and latching nothing means the
    // next open asks for the table properly, with its own visible refusal surface if it fails again.
    return [];
  });
  _fcMarkTablesInflight_(need, warm);
  return warm;
}
// FC-SUMMARY-R1 — `_fcEnsureBroadCacheThen` was REMOVED, not kept beside its replacement. Its
// `.catch(done)` swallowed the failure and re-entered the opener, which re-entered the loader, with
// nothing on screen: a silent unbounded retry. `_fcLoadPrerequisites_` keeps the same seven-read
// contract and the same `_fcSecondaryLoaded` latch, but it is single-flight and it REJECTS, so the
// caller can refuse visibly. Leaving the old one here as dead code would only invite its return.

// Bounded loading/error region for the primary FC tables (reuses KM.loadState — no new loading infra).
var _fcRegionCtl = null;
function _fcRegion_() {
  if (typeof document === 'undefined' || !(window.KM && window.KM.loadState)) return null;
  if (_fcRegionCtl) return _fcRegionCtl;
  _fcRegionCtl = window.KM.loadState.createRegion({
    render: function (state) {
      var S = window.KM.loadState.STATES;
      if (state === S.INITIAL_LOADING) {
        var msg = '<div class="empty-row">Loading FC Summary…</div>';
        var reg = document.getElementById('fc-regular-scroll-body'); if (reg) reg.innerHTML = msg;
        var evt = document.getElementById('fc-event-scroll-body'); if (evt) evt.innerHTML = msg;
      }
      // READY / EMPTY / REFRESHING / ERROR → the render fns / _fcRenderError_ own the DOM.
    }
  });
  return _fcRegionCtl;
}
// FC-SUMMARY-R2B-A2-R3 §1 — THE CONTROL'S LABEL AND THE SENTENCE THAT NAMES IT COME FROM ONE PLACE.
//
// The shared formatter ends every retryable read error with "Press Retry. It issues exactly one new
// request…". That sentence was true for the transport and false for this page: the control actually
// rendered beside it says "Refresh view" or "Check latest data" depending on what failed, and the only
// button in this file ever labelled "Retry" sits on the PREREQUISITE refusal surface, which is a
// different screen. An operator was being told to press something that was not there.
//
// The three states are not cosmetic variants — they are three different situations with three different
// remedies, and the label has to say which one you are in:
//
//   COLD_READ        nothing loaded. The remedy is to ask again.                    -> "Retry"
//   STALE_AFTER_WRITE a write CONFIRMED, only the readback failed. The data on screen
//                    is old, not wrong, and nothing needs re-sending.               -> "Refresh view"
//   UNKNOWN_WRITE    the write outcome could not be classified. The remedy is to LOOK,
//                    never to send again.                                           -> "Check latest data"
//   REFUSED_ZERO     a proven zero-write refusal. Also a look, not a resend.        -> "Check latest data"
//
// Because one map owns both the button text and the sentence, they cannot drift apart again: there is no
// second literal to forget.
var FC_RETRY_ = { COLD_READ: 'COLD_READ', STALE_AFTER_WRITE: 'STALE_AFTER_WRITE',
  UNKNOWN_WRITE: 'UNKNOWN_WRITE', REFUSED_ZERO: 'REFUSED_ZERO' };
var FC_RETRY_LABEL_ = { COLD_READ: 'Retry', STALE_AFTER_WRITE: 'Refresh view',
  UNKNOWN_WRITE: 'Check latest data', REFUSED_ZERO: 'Check latest data' };
function _fcRetryLabel_(state) {
  return Object.prototype.hasOwnProperty.call(FC_RETRY_LABEL_, state)
    ? FC_RETRY_LABEL_[state] : FC_RETRY_LABEL_.COLD_READ;
}

// F1-7N-FB-4E §F — the safe error field set, from the ONE shared formatter (KM.transport.errorLine). The
// banner previously showed "<message> [<code>]", which named neither the action, nor the request id, nor
// whether retrying could possibly help. It degrades to the old two-field form if the transport module is
// absent, so a load failure costs detail rather than the banner itself.
/* The table a failed table read was reading, '' when the error is not about one. */
function _fcErrTable_(err) {
  var t = (err && (err.kmTransport || err.transport)) || {};
  return String((t.table || (err && err.table) || '')).trim();
}
function _fcErrDetail_(err, state) {
    var label = _fcRetryLabel_(state);
    try {
        var T = window.KM && window.KM.transport;
        // The SAME structured fields the shared formatter uses, assembled here so the closing sentence can
        // name the control this page actually renders. Every other field is reproduced unchanged; nothing
        // about retry policy, endpoint selection or classification is touched.
        if (T && typeof T.errorFields === 'function') {
            var f = T.errorFields(err);
            var bits = [f.message, 'Reason: ' + f.code];
            if (f.action) bits.push('Action: ' + f.action);
            // FC-SUMMARY-R2B-A3-R6 §3 — WHICH TABLE. A prerequisite load asks for up to seven, and a
            // timeout reached the operator as 'Action: getTable', which is true and unusable: it names
            // the verb and not the noun. getOperationDbTableFromSheet already attaches the table to
            // every typed error it throws; the shared formatter simply does not carry the field, so it
            // is read from the error here rather than guessed or re-derived.
            var _tbl = _fcErrTable_(err);
            if (_tbl) bits.push('Table: ' + _tbl);
            if (f.request_id) bits.push('Request: ' + f.request_id);
            if (f.http_status !== null && f.http_status !== undefined) bits.push('HTTP ' + f.http_status);
            if (f.content_type) bits.push(f.content_type);
            if (f.html_source) bits.push('Source: ' + f.html_source);
            if (f.masked_endpoint) bits.push('Endpoint: ' + f.masked_endpoint);
            bits.push(f.retryable ? 'Retryable: yes' : 'Retryable: no');
            // Only the retryable sentence names a control. The non-retryable one says the opposite — that
            // asking again cannot help — and must survive verbatim.
            bits.push(f.retryable
                ? ('Press ' + label + '. It issues exactly one new request; no reload or navigation is needed.')
                : f.next_action);
            return bits.join(' \u00b7 ');
        }
        // Degraded path: the formatter exists but not its field accessor. Correct the one sentence rather
        // than lose the whole line — naming a missing control is the defect being repaired.
        if (T && typeof T.errorLine === 'function') {
            return String(T.errorLine(err)).split('Press Retry.').join('Press ' + label + '.');
        }
    } catch (e) {}
    return String((err && err.message) || 'failed') + ' [' + String((err && err.code) || 'READ_FAILED') + ']';
}
function _fcRenderError_(err) {
  /* §14.1 — ONE operation, not two assignments a later reader can forget to keep in step. The ledger
     goes with the model it describes, so Retry asks for everything the page actually needs. */
  _fcInvalidateModel_((err && err.code) || 'FC_SUMMARY_READ_FAILED');
  var rg = _fcRegion_(); if (rg) rg.set(window.KM.loadState.STATES.ERROR);
  var code = (err && err.code) || 'FC_SUMMARY_READ_FAILED';
  var message = (err && err.message) || 'FC Summary read failed';
  var html = '<div class="empty-row" role="alert" style="color:#B91C1C;text-align:left;overflow-wrap:break-word;word-break:break-word;">'
    + 'FC Summary read error: ' + _fcEscapeHtml(_fcErrDetail_({ code: code, message: message,
        transport: (err && (err.transport || err.kmTransport)) || null }, FC_RETRY_.COLD_READ))
    + '</div>';
  var reg = document.getElementById('fc-regular-scroll-body'); if (reg) reg.innerHTML = html;
  var evt = document.getElementById('fc-event-scroll-body'); if (evt) evt.innerHTML = html;
  var rf = document.getElementById('fc-regular-fixed-body'); if (rf) rf.innerHTML = '';
  var ef = document.getElementById('fc-event-fixed-body'); if (ef) ef.innerHTML = '';
  // FC-SUMMARY-R2B-A2-R3 §1 — the cold-read surface previously rendered the sentence and no control at
  // all, so "Press Retry" named nothing on the page. The banner supplies the button the sentence names.
  // The message body stays where it is: a refusal must not be mistaken for an empty result, and the
  // tables carry the error text rather than "No data found".
  _fcShowBanner_(FC_MSG_.READ_FAILED, _fcRetryLabel_(FC_RETRY_.COLD_READ),
    function () { _fcRefreshViewNow_(FC_MSG_.READ_FAILED, FC_RETRY_.COLD_READ); });
}

/* FC-SUMMARY-R3-R1 — _fcWorkspaceRefresh_ IS GONE, not superseded-in-place.

   It read all four tables — 221.6 KB, about ten seconds — and every caller reached for it because it
   was the only thing there: the cold mount, the Retry control, the post-write reconciliation and the
   modal's Load latest all asked for the whole workspace to show one table, or one row. Each of those
   now names the slice it actually needs.

   Leaving it here as an unused convenience would be an invitation. A page whose slowest possible read
   is still one function call away tends to acquire a caller again, and the caller is always reasonable
   in isolation. _fcSliceFetch_ replaces it, and asking for everything now requires asking for each
   slice by name — which is exactly the friction that belongs in front of a ten-second request. */

/* ==============================================================================================
   THE MOUNT. Two things happen here that did not happen before, and both remove a request rather
   than shrink one.

   ROUTE RE-ENTRY DRAWS FROM MEMORY. unmount() keeps the model — it always did — and the page used to
   re-read 221.6 KB anyway, which is why the second and third visits were as slow as the first. If the
   bootstrap and the active tab are both in hand, the tables are drawn NOW and no request is issued.

   A COLD MOUNT FIRES BOTH SLICES IN THE SAME TICK. Measured: two requests fired together cost 4.5 s
   where two fired in sequence cost 10 s. Sequential staging would pay two platform floors and be slower
   than the single request it replaced, so the bootstrap and the active tab's slice go out together and
   each draws as it lands. The Target Rules tab issues ONE request, because bootstrap carries its rows. */
function _fcMountLoad_(afterLoad) {
  var tab = _fcTabNow_();
  var epoch = _fcEpoch_();
  var draw = function () {
    if (!_fcOwns_(epoch)) return;            // routed away mid-flight: draw nothing
    try { afterLoad(); } catch (e) {}
    _fcNoteFreshness_();
  };

  var want = _FC_TAB_SLICE_[tab] || FC_SLICE_.REGULAR;
  /* bootstrap owns the rules and the marketplaces, so a tab whose keys it already carries needs no
     second request. Only Regular and Special Event have rows of their own to fetch. */
  var ridesBootstrap = (_FC_SLICE_KEYS_[want] || []).every(function (k) {
    return _FC_SLICE_KEYS_[FC_SLICE_.BOOTSTRAP].indexOf(k) !== -1;
  });

  /* WHICH SLICES ARE MISSING — not 'is the model complete'. Asking the coarser question made arriving
     on a never-loaded tab re-fetch a bootstrap that was already in memory, which is the same wasted
     six seconds this round exists to remove, just moved one case along. */
  var need = [];
  if (!_fcSliceHasData_(FC_SLICE_.BOOTSTRAP)) need.push(FC_SLICE_.BOOTSTRAP);
  if (!ridesBootstrap && !_fcSliceHasData_(want)) need.push(want);

  if (!need.length) {
    draw();
    return;                                   // ZERO logical requests. This is the whole win.
  }

  var rg = _fcRegion_(); if (rg) rg.beginLoad(!!_fcReadModel);
  /* Draw what is already known BEFORE the missing slice is asked for. A page holding two of three
     datasets should show two of three, not a blank frame until the third arrives. */
  if (_fcReadModel) draw();
  _fcDispatchWhenBootClear_(function () {
    if (!_fcOwns_(epoch)) return;      // routed away while the boot read was still open
    need.forEach(function (n) {
      _fcSliceFetch_(n).then(draw).catch(function (err) { _fcSliceFailed_(n, err, epoch); });
    });
  });
}

/* FC-SUMMARY-R2B-A3-R10 §14.3 — WHY A COLD MOUNT WAITS FOR THE BOOT READ, AND WHY THAT IS NOT A DELAY.

   The 60 s bound is the transport's and it is NOT touched here. What was wrong is when the clock
   starts: it starts at DISPATCH, so every millisecond this read spends waiting for a backend slot is
   charged to its own budget rather than to its own execution. A hard reload followed immediately by
   FC Summary put these two slices on the wire beside `getClientCapabilities`, and the arithmetic —
   not a claim about the backend scheduler — says the share of 60 s left for the read's own work can
   only go down. R6-R5 measured exactly this on Site Inventory: queue 6 480 ms + exec 55 000 ms timed
   out where the identical work alone succeeded.

   So the mechanism already exists and this page simply was not using it. Nothing new is invented, no
   second coordinator appears, and the wait is bounded three ways: only a dependency that is actually
   PENDING is waited for, a FAILED capability read releases its waiters exactly like a successful one,
   and `whenReady`'s cap can only make the read start SOONER. When the arbiter is absent — a test rig,
   a page loaded without the core module — the callback runs SYNCHRONOUSLY, which is the behaviour
   this replaces, so nothing acquires a dependency on the arbiter being present.

   The two slices still go out TOGETHER once the lane is clear. Two parallel requests were measured at
   4.5 s against 10 s sequential, and this round does not reverse a measurement it did not retake. */
var _FC_BOOT_DEPS_ = ['capabilities'];
function _fcDispatchWhenBootClear_(go) {
  var ba = null;
  try { ba = (typeof window !== 'undefined' && window.KM && window.KM.bootArbiter) ? window.KM.bootArbiter : null; } catch (e) { ba = null; }
  if (!ba || typeof ba.whenReady !== 'function' || typeof ba.dependencyState !== 'function') { go(); return; }
  var pending = _FC_BOOT_DEPS_.filter(function (n) {
    try { return ba.dependencyState(n) === 'PENDING'; } catch (e) { return false; }
  });
  if (!pending.length) { go(); return; }   // nothing open to queue behind: dispatch now, as before
  try { if (typeof ba.noteIntent === 'function') ba.noteIntent('fc-summary-primary-read'); } catch (e) {}
  Promise.resolve(ba.whenReady(pending)).then(go, go);   // FAILED releases exactly like SETTLED
}

/* A slice that failed. The page keeps everything it still knows and says which part it could not get;
   only a page with NOTHING renders the full refusal, because that is the only case where a red box is
   more honest than the rows behind it. */
function _fcSliceFailed_(name, err, epoch) {
  if (epoch !== undefined && !_fcOwns_(epoch)) return;
  var rec = _fcSliceRec_(name);
  if (rec.state === FC_FRESH_.STALE || _fcReadModel) {
    _fcNoteFreshness_(name, err);
    return;
  }
  _fcRenderError_(err);
}

/* Say which of CURRENT / REFRESHING / STALE is on screen, and never say 'current' about data that is
   not. Uses the banner the page already has rather than inventing a second status surface. */
function _fcNoteFreshness_(failedSlice, err) {
  if (typeof _fcShowBanner_ !== 'function' || typeof _fcClearBanner_ !== 'function') return;
  var bad = _fcFailedSlices_();
  if (!bad.length) { _fcClearBanner_(); return; }
  var names = { bootstrap: 'the selector data', regular: 'the Regular Forecast rows',
                events: 'the Special Event rows', rules: 'the Target Rules' };
  var stale = bad.filter(function (n) { return _fcSliceRec_(n).state === FC_FRESH_.STALE; });
  var gone = bad.filter(function (n) { return _fcSliceRec_(n).state === FC_FRESH_.REFUSED; });
  var parts = [];
  if (stale.length) parts.push('Showing the last data that loaded for ' + stale.map(function (n) { return names[n] || n; }).join(' and ') + '.');
  if (gone.length) parts.push(gone.map(function (n) { return names[n] || n; }).join(' and ') + ' could not be loaded.');
  // The label comes from _fcRetryLabel_ so the control the sentence names and the control actually drawn
  // cannot drift apart — a literal here is exactly what the shared retry-label guard exists to catch.
  _fcShowBanner_(parts.join(' '), _fcRetryLabel_(FC_RETRY_.COLD_READ), function () { _fcRetryFailedSlices_(); });
}

/* Retry asks for the slices that failed, and only those. Re-reading the page because one part of it
   did not arrive is how a ten-second request comes back for no reason. */
/* Which slices this tab cannot draw without. After an invalidation the ledger is empty rather than
   failed, so asking only for FAILED slices would ask for nothing at all — the page would present a
   Retry that issues no request. Derived from the same two declarations the mount uses. */
function _fcSlicesNeededNow_() {
  var want = _FC_TAB_SLICE_[_fcTabNow_()] || FC_SLICE_.REGULAR;
  var need = [];
  if (!_fcSliceHasData_(FC_SLICE_.BOOTSTRAP)) need.push(FC_SLICE_.BOOTSTRAP);
  var ridesBootstrap = (_FC_SLICE_KEYS_[want] || []).every(function (k) {
    return _FC_SLICE_KEYS_[FC_SLICE_.BOOTSTRAP].indexOf(k) !== -1;
  });
  if (!ridesBootstrap && !_fcSliceHasData_(want)) need.push(want);
  return need;
}
function _fcRetryFailedSlices_() {
  var epoch = _fcEpoch_();
  /* The region is still ERROR from the refusal that drew the red box. The mount announces a load
     here and Retry did not, so the one surface that records "what is on screen" kept describing a
     refusal the page was already recovering from. */
  var rg = _fcRegion_(); if (rg) rg.beginLoad(!!_fcReadModel);
  /* §14.1 — the UNION of what failed and what this tab is missing. A slice can be missing without
     being marked failed (its record went with the model), and a slice can be marked failed while
     another tab owns it; asking for either alone is how Retry came back with an empty table. */
  var bad = _fcFailedSlices_();
  _fcSlicesNeededNow_().forEach(function (n) { if (bad.indexOf(n) === -1) bad.push(n); });
  if (!bad.length) bad = [_FC_TAB_SLICE_[_fcTabNow_()] || FC_SLICE_.REGULAR];
  bad.forEach(function (n) {
    _fcSliceFetch_(n)                          // single-flight: a second click while in flight adds nothing
      .then(function () {
        if (!_fcOwns_(epoch)) return;
        _fcHydrateFromModel_();
        _fcNoteFreshness_();
      })
      .catch(function (e) { _fcSliceFailed_(n, e, epoch); });
  });
}

/* Activating a tab loads ITS slice, once, on first activation. An inactive tab costs nothing until
   somebody looks at it, which is the difference between a lazy tab and a tab that was merely drawn last. */
function _fcEnsureTabSlice_(tab) {
  if (!_fcWorkspaceMode_()) return;
  var name = _FC_TAB_SLICE_[tab];
  if (!name) return;
  if (_fcSliceHasData_(name)) return;          // already in memory — no request, no flicker
  var epoch = _fcEpoch_();
  _fcSliceFetch_(name)
    .then(function () {
      if (!_fcOwns_(epoch)) return;
      _fcHydrateFromModel_();
      _fcNoteFreshness_();
    })
    .catch(function (e) { _fcSliceFailed_(name, e, epoch); });
}

// Post-write reconcile: in Workspace mode re-read the scoped fcSummary workspace so the primary render reflects the write
// (the broad cache the db-api writer reloaded is IGNORED by the primary render), THEN run cb (the page's own
// exit-edit / close-modal / re-render). Legacy mode (or Demo): run cb immediately (the writer already reloaded the cache).
// =====================================================================================================
// FC-SUMMARY-R1 — WRITE OUTCOME TRUTHFULNESS, MODAL RECOVERY AND SINGLE-FLIGHT UX
//
// WHAT WAS WRONG. `_fcAfterWrite(cb)` ran the caller's callback — the one that closes the modal, exits
// edit mode and says "saved" — ONLY if the post-write workspace re-read succeeded. So when a write
// landed and the re-read timed out, the rows were in the database and the operator saw: a modal that
// never closed, a Save button that stayed disabled, no success message, and a red "FC Summary read
// error" painted into the table BEHIND the modal. A completed write was presented as a failed one,
// and the only obvious response — press Save again — is the one action that must never be taken while
// an outcome is unknown.
//
// THE RULE NOW. A confirmed write is reported the moment it is confirmed. The view refresh is a
// separate, best-effort second stage: when it fails it downgrades the VIEW to stale, never the WRITE.
// And the three things that used to be one outcome are now three — confirmed success, confirmed
// server refusal, and "we do not know" — because only one of them may be answered with "try again".
// =====================================================================================================

/* THE STATE MODEL. Page-local constants, not a second framework: nothing here registers, subscribes,
   polls or schedules. These are the only reachable transitions.

   PREREQUISITE  IDLE --Next--> LOADING_PREREQUISITES --ok--> READY --open builder--> IDLE
                                        |  \__ extra clicks: no transition, and NO second request
                                        \__ error --> PREREQUISITE_REFUSED --Retry--> LOADING_PREREQUISITES
                 any --route away--> UNMOUNTED  (terminal here: no DOM mutation, no new request)

   WRITE         IDLE --Save--> WRITING --success------> CONFIRMED_SUCCESS --> IDLE (latch released)
                                   |   |--success:false--> CONFIRMED_REFUSAL --> IDLE (inputs kept)
                                   |   \--throw/unreadable-> OUTCOME_UNKNOWN --> IDLE (NO automatic retry)
                                   \__ extra clicks while WRITING: zero extra logical writes
                 any --route away--> UNMOUNTED  (an in-flight write may finish; it draws nothing)

   VIEW          CURRENT --after CONFIRMED_SUCCESS--> REFRESHING --ok--> CURRENT
                                                          \--error--> STALE_AFTER_CONFIRMED_WRITE
                 STALE_AFTER_CONFIRMED_WRITE --Refresh view--> REFRESHING
                 REFRESH_REFUSED is the terminal form of a refresh that failed with no prior data to keep.

   The four outcomes that must never be collapsed into each other: confirmed success; confirmed server
   refusal; network/parse failure with an UNKNOWN write outcome; and readback failure AFTER a confirmed
   write. The last one is not a write failure and is never reported as one. */
/* FC-SUMMARY-R2B-A3-R9 §8 — A TRANSIENT FAILURE MUST NOT BE A PERMANENT ONE.

   One state said REFUSED for both 'the read timed out, press Retry' and 'this deployment does not
   have that action', so nothing downstream could tell a Builder that is one click from working from
   one that is not. The two are now distinct, classified from the typed transport error rather than
   from its wording, and REFUSED is kept as the retryable one's value so no existing reader changes
   meaning. _fcPrereqLastError_ is cleared the moment a load succeeds, which is what stops a reopened
   Builder showing an error over data that has since arrived. */
var FC_PREREQ_ = { IDLE: 'IDLE', LOADING: 'LOADING_PREREQUISITES', READY: 'READY',
                   REFUSED: 'PREREQUISITE_REFUSED',
                   FAILED_PERMANENT: 'PREREQUISITE_NONRETRYABLE', UNMOUNTED: 'UNMOUNTED' };
var _fcPrereqLastError_ = null;
/* Retryable by the SAME rule the shared read classifier uses, and never by string matching: a timeout
   and a transport error are worth one more request, a contract or configuration fault is not. */
var _FC_NONRETRYABLE_PREREQ_ = { DEPLOYMENT_CONTRACT_MISMATCH: 1, BACKEND_BUSINESS_REJECTION: 1,
  API_ENDPOINT_CONFIGURATION_INVALID: 1, TRANSPORT_NON_JSON_RESPONSE: 1 };
function _fcPrereqRetryable_(err) {
  var t = (err && err.kmTransport) || {};
  var code = String(t.code || (err && err.code) || '');
  if (_FC_NONRETRYABLE_PREREQ_[code]) return false;
  if (typeof t.retryable === 'boolean') return t.retryable;
  return true;   // an unclassified failure is treated as worth one operator-driven retry
}
var FC_WRITE_  = { IDLE: 'IDLE', WRITING: 'WRITING', SUCCESS: 'CONFIRMED_SUCCESS',
                   REFUSAL: 'CONFIRMED_REFUSAL', UNKNOWN: 'OUTCOME_UNKNOWN', UNMOUNTED: 'UNMOUNTED' };
var FC_VIEW_   = { CURRENT: 'CURRENT', REFRESHING: 'REFRESHING',
                   STALE: 'STALE_AFTER_CONFIRMED_WRITE', REFUSED: 'REFRESH_REFUSED' };

/* The six messages the page may show. They exist as constants so that "saved", "saved but stale",
   "refused", and "unknown" can never drift into each other. */
var FC_MSG_ = {
  SAVED:        'Saved successfully.',
  SAVED_STALE:  'Saved successfully, but the view could not refresh.',
  REFUSED:      'The server refused the save: ',
  UNKNOWN:      'The save result could not be confirmed. Do not submit again until the latest data has been checked.',
  /* FC-SUMMARY-R2B-A — a refusal the server proved BEFORE touching a cell. Nothing was written, the inputs are
     intact, and retrying changes nothing until the cause is fixed — three facts the UNKNOWN sentence gets
     wrong in all three directions. */
  REFUSED_ZERO: 'The server refused the save and wrote nothing. Your entries are unchanged. Retrying will not help until this is fixed: ',
  READ_FAILED:  'FC Summary data could not be loaded.',
  PREREQ_FAILED:'Prerequisite data could not be loaded.'
};

var _fcPrereqState_ = FC_PREREQ_.IDLE;
var _fcPrereqFlight_ = null;               // the ONE in-flight prerequisite promise (single-flight latch)
/* S2-R4B §10 — THE SINGLE-FLIGHT WAS KEYED BY PATH, AND THE POST-WRITE WARM-UP DOES NOT HAVE A PATH.
   _fcLoadPrerequisites_ registers its promise in _fcPrereqFlightByPath_, so two Builder opens share one
   request. _fcPostWriteWarm_ called refreshCacheTables DIRECTLY and registered nothing, and it latches
   _fcPrereqLoadedTables_ only when it RESOLVES — so a reopen during the warm-up saw the tables still
   missing and no flight to join, and bought the identical read a second time.
   This is an index of what is CURRENTLY BEING FETCHED, per table. It is not a cache and it holds no
   data: entries are added when a request starts and removed when it settles, and the only question it
   answers is "is this table already on its way". Both callers write it and both callers read it, which
   is what makes it one authority rather than a second one. */
var _fcPrereqInflightTables_ = {};          // table -> the in-flight promise currently fetching it
var _fcPrereqLoads_ = 0;                   // logical prerequisite loads issued, ever
/* SINGLE-FLIGHT IS TWO THINGS, NOT ONE. The promise latch stops a second REQUEST; this stops a second
   TRANSITION. Without it, five extra Next clicks each attached their own continuation to the one
   shared promise and all six opened the builder when it landed — one request, six modals. */
var _fcPrereqTransition_ = false;
var _fcWriteState_ = {};                   // control id -> FC_WRITE_
var _fcWriteFlight_ = {};                  // control id -> true while a logical write is in flight
var _fcViewState_ = FC_VIEW_.CURRENT;
var _fcReadbackFlight_ = false;            // the Refresh-view control is single-flight too
var _fcReadbackLoads_ = 0;
var _fcLastReceipt_ = null;                // compact receipt of the most recent confirmed write
var _fcEbStage_ = '';                      // Special Event Builder: the stage currently in flight
var _fcEbCommitted_ = [];                  // Special Event Builder: stages the server already confirmed
var _fcMeta_ = { prereqStart: null, prereqEnd: null, writeStart: null, writeEnd: null,
                 readbackStart: null, readbackEnd: null, serverDurationMs: null, attempts: null,
                 action: null, requestId: null,
                 // §4D — the stage the last failure reached, and the code that classified it. Bounded,
                 // safe, already-held facts: no endpoint, no payload, no token.
                 stage: null, classification: null };

/* OWNERSHIP. The SHARED canonical lifecycle authority — the same commitGuard(epoch, sectionId)
   contract request-order.js already uses. Nothing is copied and no per-page lifecycle is invented.
   When the authority is absent this page cannot PROVE it was superseded, so it keeps ownership rather
   than silently dropping a continuation it may still own. */
function _fcEpoch_() {
  try {
    var lc = window.KM && window.KM.lifecycle;
    return (lc && typeof lc.currentEpoch === 'function') ? lc.currentEpoch() : null;
  } catch (e) { return null; }
}
function _fcOwns_(epoch) {
  if (epoch == null) return true;
  try {
    var lc = window.KM && window.KM.lifecycle;
    if (lc && typeof lc.commitGuard === 'function') return lc.commitGuard(epoch, 'fc-summary-section') === true;
    if (lc && typeof lc.isCurrent === 'function') return lc.isCurrent(epoch) === true;
  } catch (e) {}
  return true;
}

/* METRICS. Diagnostic only, and ABSENCE STAYS UNKNOWN — a metric the envelope did not carry is never
   reported as zero, because zero milliseconds is a claim and "unknown" is the truth. No server field is
   added and no payload is logged. */
function _fcNoteEnvMeta_(env) {
  var m = env && env.meta;
  if (!m || typeof m !== 'object') return;
  if (typeof m.serverDurationMs === 'number') _fcMeta_.serverDurationMs = m.serverDurationMs;
  if (typeof m.attempts === 'number') _fcMeta_.attempts = m.attempts;
  if (m.requestId) _fcMeta_.requestId = String(m.requestId);
}
function _fcMetricsSnapshot_() {
  var out = {};
  for (var k in _fcMeta_) { if (Object.prototype.hasOwnProperty.call(_fcMeta_, k)) { out[k] = (_fcMeta_[k] == null) ? 'unknown' : _fcMeta_[k]; } }
  return out;
}

/* THE NON-BLOCKING BANNER. It sits beside the table and never replaces it. */
function _fcBannerHost_() { return (typeof document === 'undefined') ? null : document.getElementById('fc-view-banner'); }
function _fcClearBanner_() { var h = _fcBannerHost_(); if (h) { h.innerHTML = ''; h.hidden = true; } }
function _fcShowBanner_(text, actionLabel, onAction) {
  var h = _fcBannerHost_(); if (!h) return;
  h.innerHTML = '';
  var span = (typeof document !== 'undefined') ? document.createElement('span') : null;
  if (span) { span.textContent = text; h.appendChild(span); }
  if (actionLabel && typeof onAction === 'function') {
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'fc-view-refresh-btn'; b.className = 'fc-btn fc-btn--cancel';
    b.textContent = actionLabel; b.style.marginLeft = '10px';
    b.onclick = onAction;
    h.appendChild(b);
  }
  h.hidden = false;
}

/* =============================================================================================
   INCIDENT-BOOT-FC-R1 §3/§4A — WHY RETRY LEFT YEAR AT `----`.

   The cold load ran `_fcWorkspaceRefresh_().then(afterLoad)`, and afterLoad is THREE things:
   populate the filter options, populate the Year options, then render the tables. Retry ran
   `_fcWorkspaceRefresh_().then(... _fcRerenderTables_())`, which is only the third. So after a
   refusal the read model was installed correctly and the rows were re-rendered against it, but
   the Year <select> still held the single `----` option built while the model was null — and a
   table whose year filter is '' renders 'Please select a year to view data'. The banner had
   already been cleared, so a page with no year choices and no rows looked like a recovery.

   There is now ONE hydration authority and both paths call it. A second approximation of
   'load succeeded' is exactly what caused this, so this function is the only definition of it.
   ============================================================================================= */

/* The canonical workspace payload. `adaptFcSummaryWorkspace` is total — it answers `data || {}`
   and `(data.x || [])` — so ANY object-ish value adapts to four empty arrays without complaint,
   and a wrong-shaped `success:true` body would install a silent empty model that is
   indistinguishable from a genuinely empty database. Validation therefore happens HERE, before
   the adapter can erase the difference. An empty workspace is valid; an unreadable one is not. */
function _fcValidWorkspaceData_(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  var keys = ['fcRegularForecast', 'fcSpecialEvents', 'fcTargetRules', 'marketplaces'], present = 0;
  for (var i = 0; i < keys.length; i++) {
    var v = data[keys[i]];
    if (v === undefined || v === null) continue;   // absent is allowed — the shape below still has to hold
    if (!Array.isArray(v)) return false;           // present but not an array = not the canonical contract
    present++;
  }
  return present > 0;                              // {} carries no canonical table at all: unreadable, not empty
}
/* The adapted candidate, checked before it is allowed to become the read model. */
function _fcValidReadModel_(m) {
  return !!m && typeof m === 'object'
    && Array.isArray(m.fcRegularForecast) && Array.isArray(m.fcSpecialEvents)
    && Array.isArray(m.fcTargetRules) && Array.isArray(m.marketplaces);
}
/* The Year options, derived from the CANDIDATE and off-screen. Deriving before the commit is what
   makes the commit atomic: if the rows cannot yield a year list, nothing has been replaced yet. */
function _fcYearsOf_(rows) {
  var years = [];
  (rows || []).forEach(function (r) {
    var y = String((r && r.year) || '').trim();
    if (y && years.indexOf(y) === -1) years.push(y);
  });
  years.sort(function (a, b) { return Number(b) - Number(a); });
  return years;
}

/* THE ONE HYDRATION AUTHORITY. Filters, Year options and rows come from the SAME read model in the
   SAME order on the cold load, on Retry and after a write. It deliberately does NOT swallow
   exceptions: a caller that cannot hydrate must keep its refusal, and a silent catch here is what
   would let a half-built page be reported as current. */
/* THE THREE STAGES A READ CAN FAIL AT. `stage` is what the page was DOING; the error code refines it.
   These are not causes and must not be read as blame — TRANSPORT covers everything between this page
   and the answer arriving, which includes Google's own delivery hop. */
var FC_STAGE_ = { TRANSPORT: 'transport', RESPONSE: 'invalid response', HYDRATION: 'hydration' };
var FC_UNREADABLE_CODES_ = ['FC_SUMMARY_RESPONSE_UNREADABLE', 'FC_SUMMARY_MODEL_UNREADABLE'];
function _fcFailureStage_(stage, err) {
  if (stage === FC_STAGE_.HYDRATION) return FC_STAGE_.HYDRATION;   // we had the data; the view is the fault
  var code = String((err && err.code) || '');
  return (FC_UNREADABLE_CODES_.indexOf(code) > -1) ? FC_STAGE_.RESPONSE : FC_STAGE_.TRANSPORT;
}
/* The one sentence the operator reads, with the stage named. */
function _fcStageText_(text, stage, err) {
  return String(text) + ' Stage: ' + _fcFailureStage_(stage, err) + '.';
}

function _fcHydrateFromModel_() {
  _populateFcFilterOptionsFromDb();
  _populateFcYearFromDb();
  if (typeof renderFcRegularTable === 'function') renderFcRegularTable();
  if (typeof renderFcEventTable === 'function') renderFcEventTable();
  if (typeof renderTargetRulesTable === 'function') renderTargetRulesTable();
}

function _fcRerenderTables_() {
  try { if (typeof renderFcRegularTable === 'function') renderFcRegularTable(); } catch (e) {}
  try { if (typeof renderFcEventTable === 'function') renderFcEventTable(); } catch (e) {}
  try { if (typeof renderTargetRulesTable === 'function') renderTargetRulesTable(); } catch (e) {}
}

/* THE REFRESH-VIEW CONTROL. One read request per activation, never two, and a failure here still does
   not touch the recorded write outcome. */
function _fcRefreshViewNow_(failText, state) {
  if (_fcReadbackFlight_) return;                       // single-flight: extra clicks issue NOTHING
  var _st = state || FC_RETRY_.COLD_READ;
  var epoch = _fcEpoch_();
  var stale = failText || FC_MSG_.READ_FAILED;
  _fcReadbackFlight_ = true; _fcReadbackLoads_++;
  _fcViewState_ = FC_VIEW_.REFRESHING;
  _fcMeta_.readbackStart = Date.now(); _fcMeta_.readbackEnd = null;
  var btn = (typeof document !== 'undefined') ? document.getElementById('fc-view-refresh-btn') : null;
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  // §4D — how far this attempt got. It advances to HYDRATION only once the data is in hand, so the
  // catch below can tell a delivery failure from a view that could not be rebuilt from good data.
  var stage = FC_STAGE_.TRANSPORT;
  /* Refreshing the VIEW means refreshing what the view is showing — the active tab's slice and the
     bootstrap that the selectors depend on — not four tables of which two are not on screen. */
  var _vs = _FC_TAB_SLICE_[_fcTabNow_()] || FC_SLICE_.REGULAR;
  return _fcSliceFetch_(_vs).then(function () {
    _fcMeta_.readbackEnd = Date.now(); _fcReadbackFlight_ = false;
    if (!_fcOwns_(epoch)) return;
    // INCIDENT-BOOT-FC-R1 §4A — HYDRATE FIRST, DECLARE CURRENT SECOND, CLEAR THE BANNER LAST.
    // This used to re-render the rows only, leaving the Year and filter controls as they were built
    // while the model was null — and clear the banner regardless. A page with no year choices was
    // presented as recovered. If hydration throws, the throw reaches the catch below and the
    // refusal stays on screen, which is the whole point of doing it in this order.
    stage = FC_STAGE_.HYDRATION;
    _fcHydrateFromModel_();
    _fcViewState_ = FC_VIEW_.CURRENT;
    _fcClearBanner_();
  }).catch(function (err) {
    _fcMeta_.readbackEnd = Date.now(); _fcReadbackFlight_ = false;
    if (!_fcOwns_(epoch)) return;
    _fcViewState_ = _fcReadModel ? FC_VIEW_.STALE : FC_VIEW_.REFUSED;
    _fcMeta_.stage = _fcFailureStage_(stage, err);
    _fcMeta_.classification = String((err && err.code) || 'UNKNOWN');
    // The label follows the STATE this refresh was started in, not the call site's guess, and the retry it
    // schedules carries the same state — so a repeated failure cannot silently change the wording. The
    // STAGE is appended for the operator; the retry it schedules re-derives its own stage from scratch.
    _fcShowBanner_(_fcStageText_(stale, stage, err), _fcRetryLabel_(_st),
      function () { _fcRefreshViewNow_(stale, _st); });
  });
}

/* PREREQUISITES. The seven-read contract is UNCHANGED in this round; this only makes it visible,
   single-flight and refusable. The old shape swallowed the error into `.catch(done)` and re-entered the
   opener, which on a persistent failure retried forever with nothing on screen. */
function _fcPrereqPath_(mode) { return mode === 'event' ? 'event' : 'regular'; }
/* FC-SUMMARY-R2B-A3-R5 §3 — THE BUILDERS' REGULAR-FORECAST SOURCE.
 *
 * Reading the right store is only half of it: in Workspace mode that store is a SLICE model, and an
 * absent key there means unread, not empty. The regular slice is fetched at mount for the default tab,
 * which is why the operator's own session had the rows on screen — but a session that opened straight
 * onto the Event tab would hold fcSpecialEvents and no fcRegularForecast, and the Builder would again
 * resolve every Base FC to null with nothing on screen to say why.
 *
 * So the path declares what it reads. This is NOT a table on the broad-cache prerequisite list — that
 * list is the Builder's own lazily-loaded set and deliberately does not carry this table — it is the
 * existing slice owner, asked for the slice the Builder depends on, and only when the read model does
 * not already hold it. In Legacy mode there is no workspace to be authoritative about and the broad
 * cache answers as it always did, so this is inert there.
 *
 * R2-STABILITY §2 — IT IS NO LONGER THE SPECIAL PATH'S GUARD. Removing `fc_regular_forecast` from the
 * Regular path's broad-cache prerequisites did not remove the Regular Builder's need for the forecast;
 * it moved that need onto the same slice the Special path already declared. Leaving the guard keyed to
 * 'event' would have traded a REQUEST_TIMEOUT — which says so, and offers Retry — for a permanent
 * "Loading existing forecast… please wait." on a Regular Builder opened from the Event tab, which says
 * nothing at all. The guard describes the DEPENDENCY, and both builders now have it. */
function _fcBaseFcSourceMissing_(mode) {
  if (!_fcPrereqPath_(mode)) return false;
  return _fcWorkspaceMode_() && !_fcHas_('fcRegularForecast');
}
function _fcEnsureBaseFcSource_(mode) {
  if (!_fcBaseFcSourceMissing_(mode)) return Promise.resolve();
  return _fcSliceFetch_(FC_SLICE_.REGULAR);
}
/* Both prerequisites of an OPEN, settled together: the builder's broad-cache tables and, for the
   Special path, the forecast slice its Base FC column reads. Neither owner is duplicated here. */
function _fcPrereqAndSources_(mode) {
  return Promise.all([_fcLoadPrerequisites_(mode), _fcEnsureBaseFcSource_(mode)]).then(function () {});
}
function _fcPrereqNeeded_(mode) {
  if (!_fcEffectiveWorkspace()) return false;
  return !_fcPrereqLoadedPaths_[_fcPrereqPath_(mode)];
}
/* ONE in-flight promise PER PATH. Per-path rather than global because the two lists differ: a
   Regular load that is already in flight does not satisfy a Special Event open, and attaching the
   second to the first would have the builder open over tables nobody fetched. Within a path the
   latch is exactly what it was — extra clicks attach and issue nothing. */
var _fcPrereqFlightByPath_ = {};
function _fcLoadPrerequisites_(mode) {
  var p = _fcPrereqPath_(mode);
  if (_fcPrereqFlightByPath_[p]) return _fcPrereqFlightByPath_[p];
  if (_fcPrereqLoadedPaths_[p]) return Promise.resolve();  // already in memory and still valid
  var rc = (window.KM && window.KM.DB && typeof window.KM.DB.refreshCacheTables === 'function')
    ? window.KM.DB.refreshCacheTables : null;
  if (!rc) return Promise.resolve();                       // legacy/unconfigured → getters degrade as before
  // Only the tables this path is missing. On a cold open that is every one of them and this is the
  // request it always was; after a scoped invalidation it is the changed ones alone. A path whose
  // tables are all warm — because the other path already read the ones they share — issues nothing.
  var need = _fcPrereqMissing_(p);
  if (!need.length) {
    _fcPrereqLoadedPaths_[p] = true; _fcSecondaryLoaded = true; _fcPrereqState_ = FC_PREREQ_.READY;
    _fcPrereqLastError_ = null;   // §8 — every table is warm; there is nothing left to have failed
    return Promise.resolve();
  }
  /* S2-R4B §10 — A TABLE ALREADY ON ITS WAY IS NOT A TABLE TO ASK FOR.
     The post-write warm-up publishes what it is fetching, so a reopen in that window splits this list:
     tables someone else is already paying for are JOINED, and only the remainder is requested. When the
     remainder is empty nothing is sent at all and this still resolves when the data lands — which is the
     whole point, because the alternative was buying the identical read twice.
     WHAT THIS MUST NOT DO is answer early. A caller told "ready" while a table this path holds is still
     in the air is worse than a duplicate read, so the remainder request and the joined flights are
     awaited TOGETHER, and the path latch below is DERIVED from _fcPrereqMissing_ rather than asserted by
     whichever half happened to finish. A joined flight that FAILS is not this path's failure to report —
     its tables simply stay missing, and the settle below asks again for exactly those. */
  var _joinSettle = [];
  var joined = _fcInflightFor_(need);
  if (joined.length) {
    _joinSettle = joined.map(function (f) { return Promise.resolve(f).then(null, function () { return null; }); });
    need = need.filter(function (t) { return !_fcPrereqInflightTables_[t]; });
    if (!need.length) {
      _fcPrereqState_ = FC_PREREQ_.LOADING;
      var waitOnly = Promise.all(_joinSettle).then(function () {
        _fcPrereqFlightByPath_[p] = null; _fcPrereqFlight_ = null;
        return _fcSettlePrereqPath_(p, mode);
      });
      _fcPrereqFlightByPath_[p] = waitOnly; _fcPrereqFlight_ = waitOnly;
      return waitOnly;
    }
  }
  _fcPrereqState_ = FC_PREREQ_.LOADING;
  _fcPrereqLoads_++;
  _fcMeta_.prereqStart = Date.now(); _fcMeta_.prereqEnd = null;
  var flight = Promise.resolve(rc(need)).then(function (v) {
    _fcReleaseTablesInflight_(need, flight);
    _fcMeta_.prereqEnd = Date.now(); _fcPrereqFlightByPath_[p] = null; _fcPrereqFlight_ = null;
    need.forEach(function (t) { _fcPrereqLoadedTables_[t] = true; });
    // S2-R4B §10 — DERIVED, not asserted. This request may have carried only PART of the path when the
    // rest was already in flight elsewhere, so "my request landed" is not "the path is warm". When this
    // request carried the whole path the two are identical and nothing changes.
    if (!_fcPrereqMissing_(p).length) _fcPrereqLoadedPaths_[p] = true;
    // §8 — SUCCESS CLEARS THE PREVIOUS FAILURE. Data that has arrived outranks an error that
    // described its absence, and reopening the Builder must not resurrect the older of the two.
    _fcPrereqLastError_ = null;
    _fcSecondaryLoaded = true; _fcPrereqState_ = FC_PREREQ_.READY;
    return v;
  }, function (err) {
    // The latch is released on failure, so Retry issues a NEW request instead of re-awaiting a
    // promise that has already rejected. Nothing is swallowed into a silent re-entry.
    _fcReleaseTablesInflight_(need, flight);
    _fcMeta_.prereqEnd = Date.now(); _fcPrereqFlightByPath_[p] = null; _fcPrereqFlight_ = null;
    _fcPrereqLastError_ = err || null;
    _fcPrereqState_ = _fcPrereqRetryable_(err) ? FC_PREREQ_.REFUSED : FC_PREREQ_.FAILED_PERMANENT;
    throw err;
  });
  _fcMarkTablesInflight_(need, flight);
  /* S2-R4B §10 — when part of this path was joined rather than requested, the promise the caller holds
     must not settle until BOTH halves have. The remainder's failure is still this path's failure and is
     rethrown unchanged; the joined half can only leave tables missing, which _fcSettlePrereqPath_ then
     asks for. With nothing joined this is the original flight, untouched. */
  var exposed = _joinSettle.length
    ? Promise.all([flight.then(function (v) { return { v: v }; }, function (e) { return { e: e }; })]
        .concat(_joinSettle)).then(function (r) {
        if (r[0] && r[0].e) throw r[0].e;
        return _fcSettlePrereqPath_(p, mode);
      })
    : flight;
  _fcPrereqFlightByPath_[p] = exposed;
  _fcPrereqFlight_ = exposed;     // kept for the existing diagnostics that read the single latch
  return exposed;
}

/* S2-R4B §10 — ONE PLACE THAT DECIDES A PATH IS READY, reached after any join. It re-reads the tables
   rather than trusting whoever called it: if every table this path holds has arrived it latches READY,
   and if some are still missing — because a joined flight failed — it issues ONE fresh request for
   exactly those and returns that. It cannot loop, because a request that fails REJECTS rather than
   returning here, and a request that succeeds latches the tables it carried. */
function _fcSettlePrereqPath_(p, mode) {
  if (_fcPrereqMissing_(p).length) { _fcPrereqState_ = FC_PREREQ_.REFUSED; return _fcLoadPrerequisites_(mode); }
  _fcPrereqLoadedPaths_[p] = true; _fcSecondaryLoaded = true;
  _fcPrereqState_ = FC_PREREQ_.READY; _fcPrereqLastError_ = null;
  return Promise.resolve();
}

/* §7 — THE PREFETCH. It starts when the operator chooses a card, and it is the SAME single-flight the
   first Next then attaches to, so Next issues no second request. It draws nothing, blocks nothing and
   schedules nothing: a failure here is recorded by the loader and surfaced only when Next asks, which
   is the first moment an operator is waiting on an answer. A prefetch that nobody awaits must not
   raise an unhandled rejection either, hence the terminal no-op catch. */
function _fcOnModeSelected_(mode) {
  var p = _fcPrereqPath_(mode);
  if (!_fcPrereqNeeded_(p)) return;
  try { _fcLoadPrerequisites_(p).catch(function () {}); } catch (e) {}
}
function _fcNextBtn_() { return (typeof document === 'undefined') ? null : document.getElementById('fc-mode-next-btn'); }
function _fcSetNextBusy_(on) {
  var b = _fcNextBtn_(); if (!b) return;
  b.disabled = !!on;
  if (on) {
    b.setAttribute('aria-busy', 'true');
    if (b.dataset && !b.dataset.fcLabel) b.dataset.fcLabel = b.textContent;
    b.textContent = 'Loading…';
  } else {
    b.removeAttribute('aria-busy');
    if (b.dataset && b.dataset.fcLabel) { b.textContent = b.dataset.fcLabel; delete b.dataset.fcLabel; }
  }
}
function _fcClearPrereqRefusal_() {
  var h = (typeof document === 'undefined') ? null : document.getElementById('fc-mode-select-refusal');
  if (h) { h.innerHTML = ''; h.hidden = true; }
}
function _fcShowPrereqRefusal_(err) {
  var text = FC_MSG_.PREREQ_FAILED + ' ' + _fcErrDetail_(err, FC_RETRY_.COLD_READ);
  var h = (typeof document === 'undefined') ? null : document.getElementById('fc-mode-select-refusal');
  if (!h) { alert(text); return; }
  h.innerHTML = '';
  var p = document.createElement('div'); p.textContent = text; h.appendChild(p);
  var b = document.createElement('button');
  b.type = 'button'; b.id = 'fc-mode-retry-btn'; b.className = 'fc-btn fc-btn--cancel';
  b.textContent = 'Retry'; b.style.marginTop = '8px';
  b.onclick = function () { _fcClearPrereqRefusal_(); proceedToFcMode(); };   // exactly ONE new logical load
  h.appendChild(b);
  h.hidden = false;
}
function _fcOpenBuilder_(mode) {
  closeFcModal();
  if (mode === 'event') { if (typeof openEventModal === 'function') openEventModal(); }
  else { if (typeof openRegularUpdateModal === 'function') openRegularUpdateModal(); }
}

/* THE WRITE MECHANISM — ONE of them, shared by all five controls. Each control keeps its own preview,
   manifest and copy; only the latch, the outcome classification and the readback are shared. */
function _fcWriteBegin_(ctl) {
  if (_fcWriteFlight_[ctl]) return false;      // repeated clicks add ZERO logical writes
  _fcWriteFlight_[ctl] = true;
  _fcWriteState_[ctl] = FC_WRITE_.WRITING;
  _fcMeta_.writeStart = Date.now(); _fcMeta_.writeEnd = null;
  return true;
}
function _fcWriteEnd_(ctl, state) {
  _fcWriteFlight_[ctl] = false;
  _fcWriteState_[ctl] = state;
  _fcMeta_.writeEnd = Date.now();
}
/* FOUR outcomes, never three. A null or non-object response is NOT a success: "we received nothing we
   could read" and "the server said yes" are different sentences, and only one of them may close a modal. */
function _fcClassifyWrite_(res) {
  if (res && typeof res === 'object' && res.success === false) return FC_WRITE_.REFUSAL;
  if (res && typeof res === 'object') return FC_WRITE_.SUCCESS;
  return FC_WRITE_.UNKNOWN;
}
/* The canonical envelope location FIRST (`res.data.summary` — what the server actually sends), the
   legacy one second, and ABSENT STAYS ABSENT. Regular and Base Edit read only `res.summary`, which is
   always undefined, so every confirmation silently dropped its counts. */
function _fcSummaryOf_(res) {
  var d = res && res.data;
  var s = (d && d.summary) || (res && res.summary) || null;
  return (s && typeof s === 'object') ? s : null;
}
function _fcCountsLine_(s) {
  if (!s) return '';                            // no manifest → say nothing; never invent a zero
  var parts = [];
  ['created', 'updated', 'skipped', 'error', 'failed'].forEach(function (k) {
    if (typeof s[k] === 'number') parts.push(k.charAt(0).toUpperCase() + k.slice(1) + ': ' + s[k]);
  });
  return parts.length ? ('\n' + parts.join('  ')) : '';
}
function _fcReceipt_(op, rows, res) {
  _fcLastReceipt_ = {
    operation: op,
    rows: (typeof rows === 'number') ? rows : null,
    summary: _fcSummaryOf_(res),
    at: Date.now(),
    requestId: (res && res.meta && res.meta.requestId) || _fcMeta_.requestId || null,
    metrics: _fcMetricsSnapshot_()
  };
  return _fcLastReceipt_;
}
function _fcRefusalText_(res) {
  var r = (res && (res.error || (res.errors && res.errors[0] && res.errors[0].message))) || 'no reason given';
  return FC_MSG_.REFUSED + String(r) + '.';
}
/* THE UNKNOWN OUTCOME. The busy state is released so the page is usable, but the remedy offered is a
   READ, never another Save. No automatic replay happens here or anywhere else in this file. */
function _fcUnknownOutcome_(ctl, err) {
  var detail = err ? (' (' + _fcErrDetail_(err, FC_RETRY_.UNKNOWN_WRITE) + ')') : '';
  alert(FC_MSG_.UNKNOWN + detail);
  _fcShowBanner_(FC_MSG_.UNKNOWN, _fcRetryLabel_(FC_RETRY_.UNKNOWN_WRITE),
    function () { _fcRefreshViewNow_(FC_MSG_.READ_FAILED, FC_RETRY_.UNKNOWN_WRITE); });
}
/* The shared settle. opts: { ctl, op, rows, epoch, reenable, onSuccess } */
function _fcSettleWrite_(res, opts) {
  var outcome = _fcClassifyWrite_(res);
  if (outcome === FC_WRITE_.SUCCESS) _fcReceipt_(opts.op, opts.rows, res);
  _fcWriteEnd_(opts.ctl, outcome);
  if (!_fcOwns_(opts.epoch)) { _fcWriteState_[opts.ctl] = FC_WRITE_.UNMOUNTED; return outcome; }
  if (outcome === FC_WRITE_.UNKNOWN) { _fcUnknownOutcome_(opts.ctl, null); if (opts.reenable) opts.reenable(true); return outcome; }
  if (outcome === FC_WRITE_.REFUSAL) { alert(_fcRefusalText_(res)); if (opts.reenable) opts.reenable(true); return outcome; }
  if (typeof opts.onSuccess === 'function') opts.onSuccess(_fcSummaryOf_(res), res);
  return outcome;
}
/* FC-SUMMARY-R2B-A — A THROWN ERROR IS NOT AUTOMATICALLY AN UNKNOWN OUTCOME.
 *
 * The FC write adapters answer `!json.success` by throwing, so a server refusal and a dead socket arrive
 * through the same `.catch`. Some of those refusals are PROVEN zero writes — the validate-only schema gate
 * throws before it touches a cell, a documented pre-write refusal reports "zero rows written", and an
 * unavailable lock never begins. The shared adapter already encodes exactly which strings carry that proof.
 *
 * This asks that authority; it does NOT restate it. If the adapter is an older cached build that has no such
 * export, the answer is `false` and the outcome stays UNKNOWN — the safe direction, because the page then
 * claims less than it knows rather than more. */
function _fcZeroWriteProven_(err) {
  var msg = (err && err.message) ? String(err.message) : String(err == null ? '' : err);
  var DB = window.KM && window.KM.DB;
  if (!DB || typeof DB.zeroWriteProven !== 'function') return false;
  try { return DB.zeroWriteProven(msg) === true; } catch (e) { return false; }
}
/* The canonical token (`PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH`), from the same shared authority, so the
   operator is told WHICH refusal this is instead of being handed prose to interpret. */
function _fcCanonicalCode_(err) {
  var msg = (err && err.message) ? String(err.message) : String(err == null ? '' : err);
  var DB = window.KM && window.KM.DB;
  if (!DB || typeof DB.canonicalErrorCode !== 'function') return '';
  try { return String(DB.canonicalErrorCode(msg) || ''); } catch (e) { return ''; }
}
/* The CONFIRMED-REFUSAL presentation: no success, no "unknown", inputs untouched, the control released, and
   NO automatic replay — retrying is exactly what will not help. */
function _fcZeroWriteRefusal_(ctl, err) {
  var code = _fcCanonicalCode_(err);
  alert(FC_MSG_.REFUSED_ZERO + (code || _fcErrDetail_(err, FC_RETRY_.REFUSED_ZERO)) + '.');
  _fcShowBanner_(FC_MSG_.REFUSED_ZERO + (code || _fcErrDetail_(err, FC_RETRY_.REFUSED_ZERO)) + '.',
    _fcRetryLabel_(FC_RETRY_.REFUSED_ZERO),
    function () { _fcRefreshViewNow_(FC_MSG_.READ_FAILED, FC_RETRY_.REFUSED_ZERO); });
}
/* THE SPECIAL EVENT BUILDER'S FAILURE HANDLING, as a function rather than as twenty lines buried in the
 * middle of a two-hundred-line async writer. A behaviour that cannot be driven is a behaviour that can only
 * be checked by reading it, and reading is not evidence.
 *
 * THE SEQUENCE IS STILL NOT ATOMIC: campaigns then campaign_sku_lines then fc_special_events are three
 * separate writes with no transaction and no rollback. Later stages stop after the first refusal, so a
 * failure at stage 2 or 3 leaves stage 1 COMMITTED. Nothing here changes that, and nothing here replays
 * anything: reconciliation is still required before any retry.
 *
 * But "not atomic" does not make every failure unknowable. A PROVEN zero-write refusal at a given stage
 * means THAT stage wrote nothing, and because the sequence stops at the first refusal, no later stage ran
 * either. `_fcEbCommitted_` carries what HAS already committed, so the operator is told exactly what exists
 * instead of being handed "the result could not be confirmed" and left to guess. */
/* §4/§5 — the two refusals an operator can actually act on, and the action is not "try again". A
   versionless save that landed on an existing window means the event is already there: the answer is
   to select it in the picker, which loads what is stored. A version mismatch means somebody else
   saved first: the answer is to reload. Both are proven zero-writes, so nothing needs reconciling. */
function _fcEventRefusalAdvice_(code) {
  if (code === 'STALE_CAMPAIGN_VERSION' || code === 'STALE_SPECIAL_EVENT_VERSION') {
    return '\n\nThis event already exists, or it changed after this form was loaded. Nothing was'
      + ' written and your entries are intact. Close this dialog, reopen it, and pick the event from'
      + ' "New or existing event" — that loads the values that are actually stored.';
  }
  if (code === 'DUPLICATE_CAMPAIGN_IDENTITY' || code === 'DUPLICATE_TARGET_RULE_IDENTITY') {
    return '\n\nTwo stored rows already share this identity, so no save can tell them apart. Nothing'
      + ' was written. The duplicate has to be resolved in the data before this event can be saved.';
  }
  if (code === 'CAMPAIGN_IDENTITY_MISMATCH') {
    return '\n\nA campaign\'s scope, year and event window are its identity and are never repointed.'
      + ' Nothing was written. To move an event to a different window, create it as its own event.';
  }
  return '';
}
function _fcBuilderFailure_(e, epoch) {
  var proven = _fcZeroWriteProven_(e);
  var stage = _fcEbStage_ || 'the campaign write';
  _fcWriteEnd_('eventBuilder', proven ? FC_WRITE_.REFUSAL : FC_WRITE_.UNKNOWN);
  if (!_fcOwns_(epoch)) { _fcWriteState_['eventBuilder'] = FC_WRITE_.UNMOUNTED; return; }
  var committed = _fcEbCommitted_.length
    ? ' The earlier stage(s) ' + _fcEbCommitted_.join(' + ') + ' were already committed and still need reconciling.'
    : ' Nothing had been committed by an earlier stage.';
  var _st = proven ? FC_RETRY_.REFUSED_ZERO : FC_RETRY_.UNKNOWN_WRITE;
  var rawCode = (e && e.message) ? String(e.message).trim() : '';
  var msg = proven
    ? (FC_MSG_.REFUSED_ZERO + (_fcCanonicalCode_(e) || _fcErrDetail_(e, _st)) + ' - refused at ' + stage + '.'
       + committed + _fcEventRefusalAdvice_(rawCode))
    : (FC_MSG_.UNKNOWN + '\n\nSpecial Event Save stopped at ' + stage + ': ' + _fcErrDetail_(e, _st) + '.' + committed);
  alert(msg);
  _fcShowBanner_(msg, _fcRetryLabel_(_st), function () { _fcRefreshViewNow_(FC_MSG_.READ_FAILED, _st); });
}
function _fcFailWrite_(err, opts) {
  var proven = _fcZeroWriteProven_(err);
  _fcWriteEnd_(opts.ctl, proven ? FC_WRITE_.REFUSAL : FC_WRITE_.UNKNOWN);
  if (!_fcOwns_(opts.epoch)) { _fcWriteState_[opts.ctl] = FC_WRITE_.UNMOUNTED; return; }
  if (proven) _fcZeroWriteRefusal_(opts.ctl, err);
  else _fcUnknownOutcome_(opts.ctl, err);
  if (opts.reenable) opts.reenable(true);          // the modal stays open and every input is preserved
}

/* (scope, cb) for callers: the scope is the short half and belongs where it can be read at a glance. */
function _fcAfterWriteScoped_(scope, cb) { return _fcAfterWrite(cb, scope); }

function _fcAfterWrite(cb, scope) {
  // F1-7L: a FC write changed the underlying tables the secondary modals read; drop the bounded modal-cache flag
  // so the next builder/import/Event-Assist modal open re-reads fresh (bounded) rather than a stale slice.
  if (typeof _fcResetSecondaryCache === 'function') _fcResetSecondaryCache(scope);
  var live = (typeof _fcUseDb !== 'function') || _fcUseDb();
  var epoch = _fcEpoch_();

  // ---- STAGE A — THE CONFIRMED WRITE IS REPORTED NOW. ------------------------------------------
  // cb closes the modal, exits edit mode and says "saved". It runs because the WRITE was confirmed,
  // and nothing that happens to the following read can take that back. This one line is the repair.
  if (typeof cb === 'function') { try { cb(); } catch (e) { /* a reporting fault must not hide the write */ } }

  if (!_fcEffectiveWorkspace() || !live) { _fcViewState_ = FC_VIEW_.CURRENT; return; }

  /* ---- STAGE B — SCOPED, AND SOMETIMES NOT NEEDED AT ALL. -------------------------------------

     This used to re-read the ENTIRE four-table workspace — 221.6 KB and about ten seconds — to show one
     saved row. The reconciliation each write path needs depends on what its receipt already proves:

       Target Rule save      a COMPLETE canonical saved row, already merged through the canonical
                             normalizer by _trMergeReceipt_. Nothing left to ask. ZERO requests.
       Target Rule delete    the id is gone and that is the whole fact; the `rules` slice confirms it.
       Base FC / Builder /   a batch summary, not rows, so the affected table is re-read — the `regular`
       Import                slice, never the workspace.
       Special Event save    likewise, the `events` slice.

     A caller that knows better passes its scope; anything else falls back to the active tab's slice.
     What no caller can do any more is ask for everything. */
  var _sc = (typeof scope === 'string') ? { slice: scope } : (scope || {});
  if (_sc.merged) {   // the receipt was complete and is already in the model
    _fcViewState_ = FC_VIEW_.CURRENT;
    return;
  }
  var _slice = _sc.slice || _FC_TAB_SLICE_[_fcTabNow_()] || FC_SLICE_.REGULAR;
  _fcViewState_ = FC_VIEW_.REFRESHING;
  _fcMeta_.readbackStart = Date.now(); _fcMeta_.readbackEnd = null;
  /* §4 — started HERE, beside the readback, not awaited with it. The readback owns what is drawn and
     therefore owns the banner and the view state; the warm-up owns only whether the NEXT Builder open
     has to ask. Chaining them would let a warm-up failure take down a readback that succeeded, and
     awaiting them together would make the operator wait for a request they are not looking at. */
  _fcPostWriteWarm_(_sc);
  /* S3-R1 §C — RELEASE THE JOINABLE FLIGHT FIRST. A read already in the air for this slice was
     dispatched before the write, so the server computed it from the rows as they were; joining it
     would commit a pre-write answer, set the view to CURRENT and clear the banner over a table that
     is missing what the operator just saved. Dropping the handle makes the call below DISPATCH. The
     released flight is not cancelled — it cannot be — but rec.gen has moved, so when it lands it is
     dropped as superseded instead of overwriting the newer answer. */
  _fcSliceRec_(_slice).flight = null;
  _fcSliceFetch_(_slice).then(function () {
    _fcMeta_.readbackEnd = Date.now();
    if (!_fcOwns_(epoch)) return;                      // routed away → no DOM mutation
    // Same authority as the cold load. A write that introduces a year the dropdown has never seen
    // must put that year in the dropdown; re-rendering rows alone left it invisible until reload.
    _fcHydrateFromModel_();
    _fcViewState_ = FC_VIEW_.CURRENT;
    _fcClearBanner_();
  }).catch(function (err) {
    _fcMeta_.readbackEnd = Date.now();
    if (!_fcOwns_(epoch)) return;
    /* S3-R1 §C — A SUPERSEDED READBACK IS NOT A FAILED ONE. FC_SUMMARY_READ_SUPERSEDED means a newer
       read for this slice owns the answer and is either in flight or already committed; it is the
       normal outcome of two refreshes overlapping, not a refresh that could not be done. Reporting it
       as "Saved successfully, but the view could not refresh" put a stale warning over a view that was
       about to be — or already had been — correctly updated, and invited the operator to press Retry
       for a read that was not needed. The newer request owns the banner and the view state. */
    if (err && err.superseded) return;
    // THE LAST KNOWN TABLE IS KEPT. _fcRenderError_ is deliberately NOT called: it nulls the read
    // model and replaces the rows with a red box, which is right on a cold load and wrong here,
    // because those rows are real and the write that produced them succeeded.
    _fcViewState_ = _fcReadModel ? FC_VIEW_.STALE : FC_VIEW_.REFUSED;
    // A CONFIRMED write whose readback failed: the table is old, not wrong, and nothing needs re-sending.
    _fcShowBanner_(FC_MSG_.SAVED_STALE, _fcRetryLabel_(FC_RETRY_.STALE_AFTER_WRITE),
      function () { _fcRefreshViewNow_(FC_MSG_.SAVED_STALE, FC_RETRY_.STALE_AFTER_WRITE); });
  });
}

// Map fc_regular_forecast rows to the Regular Forecast render shape.
// Source of truth is fc_regular_forecast ONLY (no marketplace_skus universe supplementation here).
function _getDbFcRegularData() {
    var fcRows = _fcGetRegularForecast();   // Workspace (scoped) → read-model; Legacy → getFcRegularForecast()
    return fcRows.map(function(r) {
        return {
            sku: r.sku,
            year: r.year,
            company: r.company,
            marketplace: r.marketplace,
            country: r.country,
            category: r.category,
            series: r.series,
            months: [r.jan, r.feb, r.mar, r.apr, r.may, r.jun, r.jul, r.aug, r.sep, r.oct, r.nov, r.dec]
                .map(function(v) { return Math.ceil(Number(v) || 0); }), // whole-unit display
            forecastStatus: r.forecastStatus,
            fcShare: r.fcShare
        };
    });
}

// Live DB (Demo OFF) = the page reads/writes Operation DB; Demo ON keeps the local mock arrays.
function _fcUseDb() {
    var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
    return !demoOn;
}

// Map fc_special_events rows → Event Forecast render shape (Demo OFF). Source = getFcSpecialEvents().
function _getDbFcEventData() {
    var rows = _fcGetSpecialEvents();   // Workspace (scoped) → read-model; Legacy → getFcSpecialEvents()
    return rows.map(function(r) {
        var raw = r.raw || {};
        return {
            eventId: r.eventId || raw.event_fc_id || raw.event_id || '',   // canonical PK (event_fc_id)
            campaignId: r.campaignId || raw.campaign_id || '',             // REQUIRED by the write authority
            // R2B-A3-R1 — the campaign SKU line is the OTHER half of the canonical identity, and the
            // window is what distinguishes two events that share a name in one year. Both were being
            // dropped here, which is why the page could only ever key an event by its label.
            campaignSkuLineId: raw.campaign_sku_line_id || '',
            marketplaceId: raw.marketplace_id || '',
            startDate: raw.event_start_date || '',
            endDate: raw.event_end_date || '',
            eventMonth: raw.event_month || '',
            scopeType: raw.scope_type || '',
            scopeId: raw.scope_id || '',
            note: raw.note || '',
            rowVersion: _seFingerprint_(raw),   // §5 — the token this row's next save must carry
            raw: raw,
            sku: r.sku,
            year: raw.year || r.year || '',
            company: r.company,
            marketplace: r.marketplace,
            country: r.country,
            category: r.category,
            series: r.series,
            event: r.event,                 // normalizer: event || event_name
            eventName: r.event || raw.event_name || '',                    // write payload event_name
            eventPeriod: r.eventPeriod,      // normalizer: event_period || period
            fcQty: Number(r.fcQty) || 0
        };
    });
}

// Map fc_target_rules rows → Target Rule shape used by the table + effective-rule resolver (Demo OFF).
// Extra UI columns (year / category / series / sku) are read from raw for round-trip fidelity.
var _FC_MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function _getDbTargetRules() {
    var rows = _fcGetTargetRules();   // Workspace (scoped) → read-model; Legacy → getFcTargetRules()
    // null = the canonical rules are unread or unreadable. The TABLE draws nothing; the MODAL refuses,
    // which is _trExistingRules_'s job and not this one's. Rendering a guess here would put the fail-open
    // back one layer up.
    if (!Array.isArray(rows)) return [];
    return rows.map(function(r) {
        var raw = r.raw || {};
        var fallback = (r.targetPercentage != null) ? r.targetPercentage : 100;
        var pct = {};
        _FC_MONTH_KEYS.forEach(function(m) {
            var v = raw[m + '_pct'];
            pct[m] = (v === '' || v == null) ? fallback : (parseFloat(v) || 0);
        });
        var scope = String(raw.scope_type || '').trim();
        return {
            id: r.ruleId || raw.target_rule_id || '',
            scope: scope,
            year: raw.year ? (parseInt(raw.year, 10) || raw.year) : '',
            // R2B-A2-R5 — company and country were read by the normalizer and then discarded here, so
            // the table could not show which market a rule applied to. Both are carried now.
            company: r.company || raw.company || '',
            country: r.country || raw.country || '',
            marketplace: r.marketplace || raw.marketplace || 'All',
            category: raw.category || (scope === 'Category' ? r.scopeId : null) || null,
            series: raw.series || (scope === 'Series' ? r.scopeId : null) || null,
            sku: raw.sku || (scope === 'SKU' ? r.scopeId : null) || null,
            percentages: pct
        };
    });
}

// Active target-rule set: live DB rows on Demo OFF, else the local mock array.
function _getActiveTargetRules() {
    return _fcUseDb() ? _getDbTargetRules() : targetRules;
}

// NOTE: Cascading/faceted filter narrowing remains intentionally REMOVED — every dimension keeps its full
// option set (selecting US must NOT hide other countries' related options). Options are built per load by
// _fcSyncFilterOptions (shared KM.ui.multiFilter); table filtering (filterFcRegular / filterFcEvent) still
// applies the selected values. (_rebuildFcPanel / _rebuildFcPanelChecked / _fcCascadeFilters removed.)

// Populate all FC filter option universes from the active dataset. Kept as a thin alias so existing DB
// call sites keep working; the shared-component populate lives in _fcSyncFilterOptions (Demo ON + OFF).
function _populateFcFilterOptionsFromDb() {
    _fcSyncFilterOptions();
}

// Populate the Year dropdown from fc_regular_forecast.year distinct values (Demo OFF).
function _populateFcYearFromDb() {
    var sel = document.getElementById('fc-year-select');
    if (!sel) return;
    var rows = _fcGetRegularForecast();   // Workspace (scoped) → read-model; Legacy → getFcRegularForecast()
    // In Workspace mode the options are the list derived from the CANDIDATE before it was committed —
    // not a second derivation that could disagree with the model the rows were rendered from. Legacy
    // mode has no candidate and derives from its own rows through the same function.
    var years = (_fcReadModel && _fcCandidateYears_) ? _fcCandidateYears_ : _fcYearsOf_(rows);
    var prev = sel.value;
    // Always rebuild from DB distinct years (no static fallback). Empty DB -> only the default "----".
    sel.innerHTML = '<option value="">----</option>' +
        years.map(function(y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
    // Preserve a previously selected year if still valid; do NOT auto-select (no auto table populate).
    sel.value = (prev && years.indexOf(prev) !== -1) ? prev : '';
}

// Ensure DB is loaded (once), then populate filters/year and render (Demo OFF only).
function _fcSummaryEnsureDbAndRender() {
    var demoOn = window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled();
    if (demoOn) return; // demo keeps static options + its own data

    // Clear static/demo filter + year options immediately so they never appear in Demo OFF,
    // even before the DB cache finishes loading. (Empty cache -> default/empty state only.)
    _populateFcFilterOptionsFromDb();
    _populateFcYearFromDb();

    // INCIDENT-BOOT-FC-R1 §4A — the cold load and Retry now run the SAME function. Render still
    // reflects the current selection only: with no year selected this shows the "Please select a
    // year" empty state — the table does NOT auto-populate until user action.
    var afterLoad = _fcHydrateFromModel_;

    // Canonical: scoped fcSummary workspace (NO broad Operation DB for the primary render). Fail-closed on error —
    // a bounded FC region error, never a silent legacy broad fallback (that path lives ONLY in the Legacy branch).
    if (_fcEffectiveWorkspace()) {
        _fcMountLoad_(afterLoad);
        return;
    }

    // Legacy (kill switch OFF): the original broad-cache path — unchanged.
    if (!window._opDbCache) {
        var loader = (window.KM && window.KM.DB && window.KM.DB.loadOperationDb)
            ? window.KM.DB.loadOperationDb
            : (window.reloadOperationDb || null);
        if (loader) { loader({ force: true }).then(afterLoad).catch(afterLoad); return; }
    }
    afterLoad();
}

// ============================================================================================================
// FC-SUMMARY-R2B-A2-R3 §2/§3 — COLUMN RESIZE, ONE CONTROLLER PER TABLE.
//
// WHY THIS IS PAGE-OWNED RATHER THAN THE SHARED dualLayerResize ADAPTER. That adapter derives its columns
// generically from the header cells and takes ONE min/max/def for the whole table. This page needs the
// opposite: a per-column default map (a month column is 70px, Event Period is 190px), a per-table column
// SET (Actions must get no handle at all), and three independent persistence groups. None of that can be
// expressed through the adapter, so the page drives the SAME engine (KM.ui.resizableColumns) directly. No
// second resize implementation exists; the adapter is simply not the right shape for three unlike tables.
//
// THE SPECIFICITY DEFECT THIS FIXES, AND WHY THE FIX IS IN THE SELECTOR RATHER THAN IN !important.
// fc-overview.css used to supply every column width from rules scoped to `#fc-summary-section` — never to a
// table — pinned with max-width through :nth-child. Those rules ranked (1,3,0) and (1,4,0); the engine's
// injected rule ranked (1,2,0) and lost. Only columns 1, 4 and 6 escaped every :nth-child selector, which is
// the entire reason Series appeared to be special-cased. It never was. Worse, for columns 2/3/5/19/20 the
// BODY rule tied the engine's while the HEADER rule beat it, so dragging them moved the body and left the
// header behind.
//
// The CSS is now scoped per table and carries no max-width, and the rule injected below names TWO ids. Two
// ids outrank every single-id selector in the stylesheet whatever its class count, so the stored width wins
// for header and body TOGETHER, by construction rather than by source order. Ties were the original defect;
// this does not create another one.
var FC_RESIZE_MAX_ = 720;
var FC_RESIZE_MIN_ = 80;
// A column may not have a minimum ABOVE its own shipped default, or its first drag would silently rewiden a
// table this round was not asked to relayout. The twelve month/percent columns ship at 70px, so 70px is
// their floor; every other column uses the 80px standard.
function _fcResizeMin_(def) { return Math.min(FC_RESIZE_MIN_, def); }

// FC-SUMMARY-DISPLAY-COLUMN-VISIBILITY-R1 §2 — `group` is the column's DISPLAY group, declared here
// because this is already the canonical column schema. 'identity' | 'months' | 'summary' | 'control'.
// A 'control' column holds buttons rather than a value, so it is never offered as a view choice.
// The resize engine reads only `w` and `label`; adding this field changes no resize behaviour.
function _fcResizeCols_(w, label, group) { return { w: w, label: label, group: group || 'identity' }; }
function _fcMonthCols_(names) { return names.map(function (n) { return _fcResizeCols_(70, n, 'months'); }); }

// Each table declares its own header root, body root, panel, persistence group, column defaults and the
// 1-based positions that must NEVER receive a handle. Nothing here is shared between tables, so a width
// stored for Regular column 7 cannot reach Event column 7.
var FC_RESIZE_TABLES_ = [
  { group: 'fc-regular', panel: 'fc-panel-regular',
    header: 'fc-regular-scroll-header', body: 'fc-regular-scroll-body',
    // sticky SKU lives outside the scroll header entirely, so it has no position here and gets no handle.
    noResize: [],
    cols: [_fcResizeCols_(100, 'Year'), _fcResizeCols_(120, 'Company'), _fcResizeCols_(120, 'Marketplace'),
           _fcResizeCols_(100, 'Country'), _fcResizeCols_(120, 'Category'), _fcResizeCols_(100, 'Series')]
      .concat(_fcMonthCols_(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']))
      .concat([_fcResizeCols_(100, 'Total FC', 'summary'),
               _fcResizeCols_(150, 'Company Annual FC Share', 'summary'),
               _fcResizeCols_(150, 'All-Site Annual FC Share', 'summary')]) },

  { group: 'fc-event', panel: 'fc-panel-event',
    header: 'fc-event-scroll-header', body: 'fc-event-scroll-body',
    noResize: [],
    cols: [_fcResizeCols_(100, 'Year'), _fcResizeCols_(120, 'Company'), _fcResizeCols_(120, 'Marketplace'),
           _fcResizeCols_(100, 'Country'), _fcResizeCols_(120, 'Category'), _fcResizeCols_(100, 'Series'),
           _fcResizeCols_(120, 'Event'),
           // Event Period was previously caught by the Regular table's month rule and rendered at 70px,
           // which cannot show 2026-11-19~2026-11-30. It is not a month cell and is no longer treated as one.
           _fcResizeCols_(190, 'Event Period'),
           _fcResizeCols_(90, 'FC Qty', 'summary')] },

  { group: 'fc-target', panel: 'fc-panel-target',
    header: 'fc-target-scroll-header', body: 'fc-target-scroll-body',
    // 19 = Actions: a control cell holding buttons. Widening it reveals nothing, so it carries no handle.
    // R2B-A2-R5 — Country was inserted at position 2, so Actions moved from 18 to 19 and every rule in
    // fc-overview.css shifted with it. The shape gate (M11) is what makes this declaration and the markup
    // provably the same table rather than two lists that happen to agree today.
    noResize: [19],
    cols: [_fcResizeCols_(100, 'Year'), _fcResizeCols_(100, 'Country'), _fcResizeCols_(120, 'Marketplace'),
           _fcResizeCols_(120, 'Category'), _fcResizeCols_(100, 'Series'), _fcResizeCols_(120, 'SKU')]
      .concat(_fcMonthCols_(['Jan %', 'Feb %', 'Mar %', 'Apr %', 'May %', 'Jun %', 'Jul %', 'Aug %',
                             'Sep %', 'Oct %', 'Nov %', 'Dec %']))
      .concat([_fcResizeCols_(90, 'Actions', 'control')]) }
];
var _fcResizeCtl_ = {};        // group -> controller. One per table, torn down before any re-mount.

/* The injected rule. TWO ids, deliberately — see the note above. Header and body are written in the SAME
   rule so they can never be given different widths, which is the desynchronisation being repaired. */
function _fcResizeCssRule_(spec, c, w) {
  var wpx = w + 'px';
  return '#fc-summary-section #' + spec.header + ' > .header-cell:nth-child(' + c.col + '), ' +
         '#fc-summary-section #' + spec.body + ' .scroll-row > .scroll-cell:nth-child(' + c.col + ') ' +
         '{ width:' + wpx + '; min-width:' + wpx + '; max-width:' + wpx + '; }';
}

/* One clear reset per table. It calls the ENGINE's resetAll — there is no second reset implementation,
   and no filter, page or row is touched. Zero API calls, zero writes.

   FC-SUMMARY-DISPLAY-COLUMN-VISIBILITY-R1 §12.1 — the HOST moved from a bar above each panel into the
   toolbar's More Options menu, because a page-level toolbar is where this system keeps its secondary
   actions and the old bar was a fourth place to look. Nothing else moved: still ONE button per table,
   still carrying that table's own controller, still labelled the same. §12.5 asks for one canonical
   entry per action, so the per-panel bar is gone rather than duplicated — and R2B-A2-R3 §6's real
   requirement, that a reset can never be read as page-wide, is kept by _fcMoreOptionsSyncTab_ showing
   only the item belonging to the table currently on screen. */
function _fcResizeResetBar_(spec, ctl) {
  if (typeof document === 'undefined') return null;
  var host = document.getElementById('fc-more-options-panel'); if (!host) return null;
  var old = document.getElementById(spec.group + '-reset-widths');
  if (old && old.parentNode) old.parentNode.removeChild(old);      // idempotent across re-mounts
  var b = document.createElement('button');
  b.type = 'button';
  b.id = spec.group + '-reset-widths';
  b.className = 'km-action-menu__item fc-mo-reset';
  b.setAttribute('role', 'menuitem');
  b.textContent = 'Reset column widths';
  b.onclick = function () { if (ctl && typeof ctl.resetAll === 'function') ctl.resetAll(); };
  b.addEventListener('click', function () { if (typeof fcCloseMoreOptions === 'function') fcCloseMoreOptions(); });
  host.appendChild(b);
  return b;
}

function _fcResizeMount_(spec) {
  var lib = window.KM && window.KM.ui && window.KM.ui.resizableColumns;
  if (!lib || typeof document === 'undefined') return null;
  // THE ROOT IS THIS TABLE'S OWN PANEL, NOT THE SECTION. The engine's destroy() removes every handle it
  // finds under `root`, so three controllers sharing `#fc-summary-section` would each strip the other two
  // tables' handles on a re-mount — and after one remount the first two tables had none left at all.
  // Scoping the root to the panel is what makes "one controller per table" true of teardown as well as of
  // setup. getHeaderCells and cssRule address elements by id, so neither is affected.
  var root = document.getElementById(spec.panel); if (!root) return null;
  var header = document.getElementById(spec.header); if (!header) return null;
  var cells = header.querySelectorAll(':scope > .header-cell');
  // SHAPE GATE. If the markup and this declaration disagree, wire NOTHING rather than attach handles to
  // positions that no longer mean what they say — a resize that moves the wrong column is worse than none.
  if (!cells.length || cells.length !== spec.cols.length) return null;

  var columns = [];
  spec.cols.forEach(function (c, i) {
    var col = i + 1;
    if (spec.noResize.indexOf(col) !== -1) return;                 // declared non-resizable: no handle at all
    columns.push({ key: spec.group + '-c' + col, col: col, label: c.label,
      min: _fcResizeMin_(c.w), max: FC_RESIZE_MAX_, def: c.w });
  });

  if (_fcResizeCtl_[spec.group]) {
    try { _fcResizeCtl_[spec.group].destroy(); } catch (e) {}      // never stack handles on a re-mount
    _fcResizeCtl_[spec.group] = null;
  }
  var ctl = lib.create({
    root: root,
    // page+group keep each tab's widths in their own subtree of one storage key, so resizing Regular
    // cannot move Event and a reset cannot reach across tabs.
    storage: { key: 'km.ui.tableWidths.v1', page: 'fc-summary', group: spec.group },
    columns: columns,
    getHeaderCells: function (c) {
      var h = document.getElementById(spec.header); if (!h) return [];
      var list = h.querySelectorAll(':scope > .header-cell');
      var cell = list[c.col - 1];
      return cell ? [cell] : [];
    },
    cssRule: function (c, w) { return _fcResizeCssRule_(spec, c, w); }
  });
  if (!ctl) return null;
  _fcResizeCtl_[spec.group] = ctl;
  ctl.init();
  _fcResizeResetBar_(spec, ctl);
  return ctl;
}

function _fcResizeInit_() {
  var mounted = [];
  FC_RESIZE_TABLES_.forEach(function (spec) {
    var c = _fcResizeMount_(spec);
    if (c) mounted.push(spec.group);
  });
  return mounted;
}


// ================================================================================================
// FC-SUMMARY-DISPLAY-COLUMN-VISIBILITY-R1 — COLUMN VISIBILITY: ONE REGISTRY, ONE RESOLVED SET,
// ONE INJECTED STYLESHEET.
// ================================================================================================
// WHY A STYLESHEET AND NOT INLINE STYLES ON CELLS. This page rebuilds `scroll-body.innerHTML` from
// scratch on every filter change, every page change, every tab activation and every save readback,
// and the rebuilt cells carry no attributes at all — not even a column index. An implementation that
// wrote `cell.style.display` would therefore be undone by the next render while the HEADER kept its
// hidden state, which is precisely the defect SKU Details had to be repaired for (see
// F1-7N-SKU-DETAILS-DISPLAY-INIT-R1). A rule addressed by :nth-child cannot be undone by a re-render,
// because it is not stored on the elements. Nothing has to be re-applied after a render, so nothing
// can forget to.
//
// It also keeps §5 true by construction: hiding a column changes ONE textContent on ONE <style>
// element. No row is rebuilt, no filter is read, no page index is touched, no share is recomputed and
// no request is issued, because none of that code is on this path at all.
//
// THE SELECTOR IS THE RESIZE SELECTOR, DELIBERATELY. Two ids, header and body in one rule — the same
// shape _fcResizeCssRule_ uses and for the same reason: two ids outrank every single-id width rule in
// fc-overview.css whatever its class count. Width and visibility are different PROPERTIES, so the two
// injected sheets never compete; a hidden column keeps its stored width and gets it back on re-show
// (§8). :nth-child positions do not shift when a sibling is display:none, so hiding a column cannot
// move a width rule onto its neighbour.
//
// THE PREFERENCE STORES HIDDEN KEYS, NOT VISIBLE ONES. §6 requires that a column introduced later is
// not silently hidden forever by an older preference. Storing the visible set would do exactly that;
// storing the hidden set means an unknown column is simply absent from it and resolves to VISIBLE.
// The storage name says `hiddenColumns` so the key can never disagree with what is in it.
//
// KEYS ARE SLUGGED LABELS, NEVER THE COLUMN INDEX. Inserting a column in the middle of a table (which
// R2B-A2-R5 already did once, to Target) would otherwise shift every stored preference one column to
// the right and hide the wrong thing.
var FC_COLPREF_KEY_ = 'km.ui.fcSummary.hiddenColumns.v1';
var FC_COLPREF_VERSION_ = 1;
var FC_COLVIS_STYLE_ID_ = 'fc-colvis-style';

// The panel's section order. `control` is deliberately absent: a control column is not a view choice.
var FC_COLVIS_GROUPS_ = [
  { key: 'identity', label: 'Identity' },
  { key: 'months', label: 'Forecast Months' },
  { key: 'summary', label: 'Summary' }
];

// group -> resolved column list. Re-read from storage on each mount and authoritative in between, so a
// localStorage that cannot be read or written degrades to a session-only preference rather than to a
// broken page.
var _fcVisibleColsState = null;
var _fcColVisBound = false;

function _fcHasLocalStorage_() { try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; } }

function _fcColKey_(label) {
  return String(label).toLowerCase().replace(/%/g, 'pct').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function _fcColEsc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// THE REGISTRY IS DERIVED FROM FC_RESIZE_TABLES_, which is already this page's canonical column schema
// (position, label and now group, declared once per column beside its width). A second list would be a
// second answer, and the shape gate that keeps the resize declaration honest against the markup would
// not cover it.
function fcColumnRegistry_(group) {
  var spec = null;
  for (var i = 0; i < FC_RESIZE_TABLES_.length; i++) if (FC_RESIZE_TABLES_[i].group === group) spec = FC_RESIZE_TABLES_[i];
  if (!spec) return [];
  var out = [];
  for (var c = 0; c < spec.cols.length; c++) {
    var col = spec.cols[c];
    out.push({ key: _fcColKey_(col.label), col: c + 1, label: col.label, group: col.group,
      hideable: col.group !== 'control' });
  }
  return out;
}

function _fcColPrefRead_() {
  if (!_fcHasLocalStorage_()) return null;
  var raw;
  try { raw = localStorage.getItem(FC_COLPREF_KEY_); } catch (e) { return null; }
  if (!raw) return null;
  var o;
  try { o = JSON.parse(raw); } catch (e) { return null; }          // corrupt JSON -> no preference -> all visible
  if (!o || typeof o !== 'object' || o.v !== FC_COLPREF_VERSION_) return null;
  if (!o.hidden || typeof o.hidden !== 'object' || Object.prototype.toString.call(o.hidden) === '[object Array]') return null;
  return o.hidden;
}

function _fcColPrefWrite_(hidden) {
  if (!_fcHasLocalStorage_()) return false;
  try { localStorage.setItem(FC_COLPREF_KEY_, JSON.stringify({ v: FC_COLPREF_VERSION_, hidden: hidden })); return true; }
  catch (e) { return false; }                                      // quota / private mode -> session-only, page still works
}

/**
 * THE SINGLE SOURCE OF TRUTH. Registry first, preference second.
 *
 * Reconciliation:
 *   - a wrong version, a wrong shape or unreadable storage is NO preference -> everything visible
 *   - a stored group that is not a table at all is never read, because the tables are the outer loop
 *   - a stored key that is not in that table's registry is never read either, because the registry is
 *     the inner loop and the stored set is only ever consulted AS `hidden[registryKey]`. Filtering the
 *     stored list first would have looked like a guard and prevented nothing; the shape is the guard.
 *   - a non-string entry cannot collide with a slugged key; duplicates collapse (it is a set)
 *   - a registry column absent from the stored hidden list is VISIBLE (this is the new-column policy)
 *   - a NON-HIDEABLE column is VISIBLE whatever the preference says. This is the one line standing
 *     between a hand-edited or stale preference and a Target table whose rows have lost their Actions,
 *     so it is stated once, here, and nowhere else.
 */
function fcResolveVisibleColumns_(forceReload) {
  if (_fcVisibleColsState && !forceReload) return _fcVisibleColsState;
  var stored = _fcColPrefRead_() || {};
  var state = {};
  FC_RESIZE_TABLES_.forEach(function (spec) {
    var reg = fcColumnRegistry_(spec.group);
    var hidden = {};
    var list = stored[spec.group];
    if (Object.prototype.toString.call(list) === '[object Array]') {
      for (var j = 0; j < list.length; j++) if (typeof list[j] === 'string') hidden[list[j]] = true;
    }
    state[spec.group] = reg.map(function (c) {
      return { key: c.key, col: c.col, label: c.label, group: c.group, hideable: c.hideable,
        visible: c.hideable ? !hidden[c.key] : true };
    });
  });
  _fcVisibleColsState = state;
  return state;
}

function _fcColVisPersist_(state) {
  var hidden = {};
  FC_RESIZE_TABLES_.forEach(function (spec) {
    var keys = [];
    (state[spec.group] || []).forEach(function (c) { if (c.hideable && !c.visible) keys.push(c.key); });
    if (keys.length) hidden[spec.group] = keys;                    // an all-visible table stores nothing
  });
  return _fcColPrefWrite_(hidden);
}

function _fcColVisCssRule_(spec, col) {
  return '#fc-summary-section #' + spec.header + ' > .header-cell:nth-child(' + col + '), ' +
         '#fc-summary-section #' + spec.body + ' .scroll-row > .scroll-cell:nth-child(' + col + ') ' +
         '{ display: none; }';
}

/**
 * THE ONLY WRITER of column visibility. One <style> element, replaced wholesale, holding the rules for
 * ALL THREE tables — so switching tabs needs no re-apply and a re-mount cannot stack a second sheet.
 * It re-renders nothing and reads no filter, page or edit state.
 */
function applyFcColumnVisibility_(state) {
  state = state || fcResolveVisibleColumns_();
  if (typeof document === 'undefined') return state;
  var rules = [];
  FC_RESIZE_TABLES_.forEach(function (spec) {
    (state[spec.group] || []).forEach(function (c) { if (!c.visible) rules.push(_fcColVisCssRule_(spec, c.col)); });
  });
  var el = document.getElementById(FC_COLVIS_STYLE_ID_);
  if (!el) {
    el = document.createElement('style');
    el.id = FC_COLVIS_STYLE_ID_;
    (document.head || document.documentElement).appendChild(el);
  }
  el.textContent = rules.join('\n');
  _fcSyncDisplayControl_(state);
  return state;
}

// tab id -> resize/visibility group. One mapping, so a renamed tab cannot half-move the page.
function fcActiveTabGroup_() {
  var t = typeof document !== 'undefined' ? document.querySelector('.fc-tab--active') : null;
  var tab = (t && t.dataset && t.dataset.tab) || 'regular';
  return 'fc-' + tab;
}

/** Mirror the resolved set onto the control: checkbox states and the "n of m columns" count. */
function _fcSyncDisplayControl_(state) {
  if (typeof document === 'undefined') return;
  state = state || fcResolveVisibleColumns_();
  var cols = (state[fcActiveTabGroup_()] || []).filter(function (c) { return c.hideable; });
  var panel = document.getElementById('fc-display-panel');
  var vis = 0;
  cols.forEach(function (c) {
    if (c.visible) vis++;
    if (!panel) return;
    var cb = panel.querySelector('.fc-display-cb[data-colkey="' + c.key + '"]');
    if (cb) cb.checked = c.visible;
  });
  var count = document.getElementById('fc-display-count');
  if (count) count.textContent = cols.length ? '(' + vis + ' of ' + cols.length + ' columns)' : '';
}

/** Build the panel for the ACTIVE tab only — §7: never offer a column that tab does not render. */
function fcRenderDisplayPanel_() {
  if (typeof document === 'undefined') return null;
  var panel = document.getElementById('fc-display-panel');
  if (!panel) return null;
  var group = fcActiveTabGroup_();
  var cols = (fcResolveVisibleColumns_()[group] || []).filter(function (c) { return c.hideable; });
  var html = [];
  var present = {};
  FC_COLVIS_GROUPS_.forEach(function (g) {
    var inGroup = cols.filter(function (c) { return c.group === g.key; });
    if (!inGroup.length) return;                                   // a group with no columns here is not drawn
    present[g.key] = true;
    html.push('<div class="fc-display-group">');
    html.push('<div class="km-action-menu__section">' + _fcColEsc_(g.label) + '</div>');
    inGroup.forEach(function (c) {
      html.push('<label class="fc-display-item"><input type="checkbox" class="fc-display-cb" data-colkey="' +
        _fcColEsc_(c.key) + '"' + (c.visible ? ' checked' : '') + '><span>' + _fcColEsc_(c.label) + '</span></label>');
    });
    html.push('</div>');
  });
  // Presets. Only the ones this tab can honour are offered; "Months Only" on a table with no month
  // column would hide everything and mean nothing.
  var presets = [{ p: 'all', label: 'Select All' }];
  if (present.months) presets.push({ p: 'months', label: 'Months Only' });
  if (present.summary) presets.push({ p: 'summary', label: 'Summary Only' });
  presets.push({ p: 'reset', label: 'Reset Default' });
  html.push('<div class="km-action-menu__divider"></div><div class="fc-display-presets">');
  presets.forEach(function (x) {
    html.push('<button type="button" class="fc-display-preset" data-preset="' + x.p + '">' + _fcColEsc_(x.label) + '</button>');
  });
  html.push('</div>');
  // The identity column is OUTSIDE the scroll header (it is the frozen column), so it is absent from
  // every registry and cannot be hidden by anything here. Saying so is cheaper than being asked.
  html.push('<div class="fc-display-note">' + _fcColEsc_(group === 'fc-target' ? 'Scope' : 'SKU') +
    ' is the row identity and is always shown.</div>');
  panel.innerHTML = html.join('');
  _fcSyncDisplayControl_();
  return panel;
}

/** Flip ONE column. Writes the resolved set, persists it, re-applies. Nothing else. */
function fcSetColumnVisible_(group, key, visible) {
  var state = fcResolveVisibleColumns_();
  var cols = state[group] || [];
  for (var i = 0; i < cols.length; i++) {
    if (cols[i].key === key && cols[i].hideable) { cols[i].visible = !!visible; break; }
  }
  _fcColVisPersist_(state);
  return applyFcColumnVisibility_(state);
}

/**
 * Presets. `all` states explicitly that nothing is hidden; `reset` DROPS this table's stored entry so a
 * future change to the shipped default reaches a user who has pressed it. Both show everything today —
 * they differ in what is left in storage, which is the only thing that could ever make them differ.
 */
function fcApplyColumnPreset_(preset, group) {
  group = group || fcActiveTabGroup_();
  var state = fcResolveVisibleColumns_();
  var cols = state[group] || [];
  cols.forEach(function (c) {
    if (!c.hideable) return;
    if (preset === 'all' || preset === 'reset') c.visible = true;
    else if (preset === 'months') c.visible = c.group === 'months';
    else if (preset === 'summary') c.visible = c.group === 'summary';
  });
  if (preset === 'reset') {
    var stored = _fcColPrefRead_() || {};
    delete stored[group];
    _fcColPrefWrite_(stored);
  } else {
    _fcColVisPersist_(state);
  }
  applyFcColumnVisibility_(state);
  fcRenderDisplayPanel_();
  return state;
}

// ---- The two toolbar popovers ------------------------------------------------------------------
// §12.6 — only one may be open. Opening either closes the other, and both close on outside click, on
// Escape, and (More Options only) after an action is chosen. A checkbox click must NOT close Display.
function fcCloseDisplayMenu() {
  if (typeof document === 'undefined') return;
  var p = document.getElementById('fc-display-panel'), b = document.getElementById('fc-display-btn');
  if (p) p.hidden = true;
  if (b) b.setAttribute('aria-expanded', 'false');
}
function fcCloseMoreOptions() {
  if (typeof document === 'undefined') return;
  var p = document.getElementById('fc-more-options-panel'), b = document.getElementById('fc-more-options-btn');
  if (p) p.hidden = true;
  if (b) b.setAttribute('aria-expanded', 'false');
}
function fcCloseToolbarMenus_() { fcCloseDisplayMenu(); fcCloseMoreOptions(); }

function fcToggleDisplayMenu(ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  var p = document.getElementById('fc-display-panel'), b = document.getElementById('fc-display-btn');
  if (!p) return;
  var open = !!p.hidden;
  fcCloseMoreOptions();
  if (open) fcRenderDisplayPanel_();                               // always current with the active tab
  p.hidden = !open;
  if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) { var first = p.querySelector('.fc-display-cb'); if (first && first.focus) first.focus(); }
}

function fcToggleMoreOptions(ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  var p = document.getElementById('fc-more-options-panel'), b = document.getElementById('fc-more-options-btn');
  if (!p) return;
  var open = !!p.hidden;
  fcCloseDisplayMenu();
  p.hidden = !open;
  if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/**
 * Per-tab contents of More Options. The two relocated data-management actions are the SAME elements
 * `updateActionButtons` and `_fcSetEditLock` have always driven — same ids, same `.fc-btn-regular`
 * marker, same handlers — so their tab rules and their edit-mode lock still apply without a second
 * owner. This only hides the reset item belonging to a table that is not on screen, and hides the
 * divider when nothing is left above it.
 */
function _fcMoreOptionsSyncTab_(tab) {
  if (typeof document === 'undefined') return;
  var active = document.querySelector('.fc-tab--active');
  var group = 'fc-' + (tab || (active && active.dataset && active.dataset.tab) || 'regular');
  var any = false;
  FC_RESIZE_TABLES_.forEach(function (spec) {
    var b = document.getElementById(spec.group + '-reset-widths');
    if (b) b.hidden = spec.group !== group;
  });
  ['fc-edit-btn', 'fc-import-btn'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el && el.style.display !== 'none') any = true;
  });
  var sep = document.getElementById('fc-more-options-divider');
  if (sep) sep.hidden = !any;
}

/** Bind ONCE. The panel body is rebuilt on every open, so per-element listeners would stack; these are
 *  delegated to the containers, which are static markup and are never replaced. */
function _fcColVisBind_() {
  if (_fcColVisBound || typeof document === 'undefined') return;
  var panel = document.getElementById('fc-display-panel');
  if (!panel) return;
  panel.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('fc-display-cb')) return;
    fcSetColumnVisible_(fcActiveTabGroup_(), t.getAttribute('data-colkey'), !!t.checked);
  });
  panel.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('fc-display-preset')) {
      e.preventDefault();
      fcApplyColumnPreset_(t.getAttribute('data-preset'));
    }
    if (e.stopPropagation) e.stopPropagation();                    // a click inside must not reach the outside-click closer
  });
  document.addEventListener('click', function (e) {
    if (!document.getElementById('fc-summary-section')) return;
    var inDisplay = e.target && e.target.closest && e.target.closest('.fc-display-menu');
    var inMore = e.target && e.target.closest && e.target.closest('.fc-more-menu');
    if (!inDisplay) fcCloseDisplayMenu();
    if (!inMore) fcCloseMoreOptions();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('fc-summary-section')) return;
    fcCloseToolbarMenus_();
  });
  _fcColVisBound = true;
}

/** Mount. Re-reads the preference, applies it, rebuilds the panel for the active tab, binds once. */
function _fcColVisInit_() {
  if (typeof document === 'undefined' || !document.getElementById('fc-summary-section')) return null;
  var state = fcResolveVisibleColumns_(true);
  applyFcColumnVisibility_(state);
  fcRenderDisplayPanel_();
  _fcMoreOptionsSyncTab_();
  fcCloseToolbarMenus_();                                          // a re-entry never lands with a popover open
  _fcColVisBind_();
  return state;
}

if (typeof window !== 'undefined') {
  window.fcToggleDisplayMenu = fcToggleDisplayMenu;
  window.fcCloseDisplayMenu = fcCloseDisplayMenu;
  window.fcToggleMoreOptions = fcToggleMoreOptions;
  window.fcCloseMoreOptions = fcCloseMoreOptions;
}

// Extend the (already demo-patched) initFcSummaryPage to also wire the DB connection.
var _prevInitFcSummaryPage = window.initFcSummaryPage;
window.initFcSummaryPage = function() {
    if (_prevInitFcSummaryPage) _prevInitFcSummaryPage();
    // Defer slightly so dropdown init (also deferred) has run; panel rebuild is order-independent.
    setTimeout(_fcSummaryEnsureDbAndRender, 60);
    // FC-SUMMARY-R2B-A2-R3 §2 — all THREE tables, each with its own column map and persistence group.
    // Header cells are static markup, so this runs once per mount and the handles survive body re-renders,
    // filtering and pagination; a re-mount tears the previous controllers down before rebuilding.
    setTimeout(function () {
      _fcResizeInit_();
      // DISPLAY-COLUMN-VISIBILITY-R1 — after the resize mount, because the per-table reset items it
      // appends to More Options are what _fcMoreOptionsSyncTab_ arranges.
      _fcColVisInit_();
    }, 120);
};

// ========================================
// Regular Forecast Import (CSV -> KM.DB.importFcRegularForecastBatch)
// Country + Marketplace are selected in the modal; company/country/marketplace/marketplace_id
// are resolved from the marketplaces registry and attached to every row. CSV carries only
// sku + jan..dec.
// ========================================
var FC_IMPORT_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
var _fcImportResolved = null; // { company, country, marketplace, marketplaceId }

function _fcImportActiveMarketplaces() {
    var list = _fcGetMarketplaces();   // Workspace (scoped) → read-model; Legacy → getMarketplaces()
    return list.filter(function(m) { var s = (m.status || '').toLowerCase(); return !s || s === 'active'; });
}

function _fcImportSetResolvedText(message, color) {
    var el = document.getElementById('fc-import-resolved');
    if (!el) return;
    el.style.color = color || '#475569';
    el.textContent = message;
}

function openFcImportModal() {
    var yearEl = document.getElementById('fc-import-year');
    if (yearEl) {
        var ySel = document.getElementById('fc-year-select');
        yearEl.value = (ySel && ySel.value) ? ySel.value : String(new Date().getFullYear());
    }
    var countrySel = document.getElementById('fc-import-country');
    if (countrySel) {
        var active = _fcImportActiveMarketplaces();
        var countries = [];
        active.forEach(function(m) { if (m.country && countries.indexOf(m.country) === -1) countries.push(m.country); });
        countries.sort();
        countrySel.innerHTML = '<option value="">Select Country</option>' +
            countries.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    }
    var mpSel = document.getElementById('fc-import-marketplace');
    if (mpSel) mpSel.innerHTML = '<option value="">Select Marketplace</option>';
    _fcImportResolved = null;
    _fcImportSetResolvedText('Select Country + Marketplace to resolve company.', '#475569');
    var fileEl = document.getElementById('fc-import-file');
    if (fileEl) fileEl.value = '';
    var resultEl = document.getElementById('fc-import-result');
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    var runBtn = document.getElementById('fc-import-run-btn');
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; runBtn.dataset.mode = ''; }
    if (typeof showFcModal === 'function') showFcModal('fc-import-modal');
}

function closeFcImportModal() {
    if (typeof closeFcModal === 'function') closeFcModal();
}

// Stable option value for a marketplace registry row: marketplace_id, else company|country|marketplace.
function _fcImportRowValue(m) {
    return (m.marketplaceId && m.marketplaceId !== '') ? m.marketplaceId : (m.company + '|' + m.country + '|' + m.marketplace);
}

function onFcImportCountryChange() {
    var countrySel = document.getElementById('fc-import-country');
    var mpSel = document.getElementById('fc-import-marketplace');
    var country = countrySel ? countrySel.value : '';
    if (mpSel) {
        var active = _fcImportActiveMarketplaces();
        // One option PER registry row (so e.g. "KM Amazon" and "Amazon" under ResUS are distinct),
        // displaying marketplace_display_name, value = marketplace_id (fallback composite key).
        var rowsForCountry = active.filter(function(m) { return !country || m.country === country; });
        mpSel.innerHTML = '<option value="">Select Marketplace</option>' +
            rowsForCountry.map(function(m) {
                var val = _fcImportRowValue(m);
                var label = m.marketplaceDisplayName || m.marketplace || m.marketplaceId || val;
                return '<option value="' + _fcEscapeHtml(val) + '">' + _fcEscapeHtml(label) + '</option>';
            }).join('');
    }
    _fcImportResolved = null;
    _fcImportSetResolvedText('Select Country + Marketplace to resolve company.', '#475569');
}

// Resolve exactly one active marketplace registry row from the selected country + marketplace.
// Sets _fcImportResolved on success; returns { ok, error? }.
function _fcResolveImportMarketplace() {
    _fcImportResolved = null;
    var mpSel = document.getElementById('fc-import-marketplace');
    var val = mpSel ? mpSel.value : '';
    if (!val) return { ok: false, error: 'Select Country and Marketplace.' };
    // Resolve the EXACT selected registry row by option value (marketplace_id / composite key),
    // not by country + marketplace text — this disambiguates shared platform names.
    var matches = _fcImportActiveMarketplaces().filter(function(m) { return _fcImportRowValue(m) === val; });
    if (matches.length === 0) return { ok: false, error: 'Selected marketplace not found in the active registry.' };
    if (matches.length > 1) return { ok: false, error: 'Selected marketplace value is ambiguous in the registry.' };
    var m = matches[0];
    _fcImportResolved = {
        company: m.company,
        country: m.country,
        marketplace: m.marketplace,
        marketplaceId: m.marketplaceId || '',
        displayName: m.marketplaceDisplayName || m.marketplace || (m.marketplaceId || '')
    };
    return { ok: true };
}

function onFcImportMarketplaceChange() {
    var res = _fcResolveImportMarketplace();
    if (_fcImportResolved) {
        _fcImportSetResolvedText(
            'Resolved → Company: ' + _fcImportResolved.company +
            ' | Country: ' + _fcImportResolved.country +
            ' | Marketplace: ' + (_fcImportResolved.displayName || _fcImportResolved.marketplace) +
            ' | Marketplace ID: ' + (_fcImportResolved.marketplaceId || '(none)'),
            '#166534'
        );
    } else {
        _fcImportSetResolvedText((res && res.error) ? res.error : 'Select Country + Marketplace to resolve company.', '#b91c1c');
    }
}

// Quote / escaped-quote / CRLF aware CSV parser.
function _parseFcCsv(text) {
    var rows = [], field = '', row = [], inQuotes = false;
    text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (var i = 0; i < text.length; i++) {
        var c = text[i];
        if (inQuotes) {
            if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
            else { field += c; }
        } else {
            if (c === '"') { inQuotes = true; }
            else if (c === ',') { row.push(field); field = ''; }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else { field += c; }
        }
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

function downloadFcImportTemplate() {
    var res = _fcResolveImportMarketplace();
    if (!_fcImportResolved) { alert('Please select Country and Marketplace first.' + (res && res.error ? ('\n' + res.error) : '')); return; }
    var headers = 'sku,jan,feb,mar,apr,may,jun,jul,aug,sep,oct,nov,dec';
    var sample = 'SAMPLE-SKU,0,0,0,0,0,0,0,0,0,0,0,0';
    var csv = headers + '\n' + sample + '\n';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'fc_regular_forecast_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function _fcEscapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _fcRenderImportError(message) {
    var box = document.getElementById('fc-import-result');
    if (!box) { alert(message); return; }
    box.style.display = 'block';
    box.innerHTML = '<div style="color:#dc2626;font-weight:600;">Error: ' + _fcEscapeHtml(message) + '</div>';
}

function _fcRenderImportResult(data, invalidCount) {
    var box = document.getElementById('fc-import-result');
    if (!box) return;
    var s = data.summary || { total: 0, created: 0, updated: 0, skipped: 0, error: 0 };
    var results = data.results || [];
    var html = '<div style="font-weight:600;display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">' +
        '<span>Total: ' + s.total + '</span>' +
        '<span style="color:#16a34a;">Created: ' + s.created + '</span>' +
        '<span style="color:#0080bb;">Updated: ' + s.updated + '</span>' +
        '<span style="color:#d97706;">Skipped: ' + s.skipped + '</span>' +
        '<span style="color:#dc2626;">Error: ' + s.error + '</span></div>';
    if (invalidCount > 0) html += '<div style="font-size:11px;color:#dc2626;margin-bottom:6px;">' + invalidCount + ' row(s) missing SKU (reported as errors below).</div>';
    html += results.map(function(rr) {
        var color = rr.status === 'created' ? '#16a34a' : rr.status === 'updated' ? '#0080bb' : rr.status === 'skipped' ? '#d97706' : '#dc2626';
        return '<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #f1f5f9;">' +
            '<span style="font-weight:600;min-width:64px;color:' + color + ';">' + _fcEscapeHtml(rr.status) + '</span>' +
            '<span>#' + _fcEscapeHtml(String(rr.rowIndex)) + '</span>' +
            '<span>' + _fcEscapeHtml(rr.sku || '') + '</span>' +
            '<span>' + _fcEscapeHtml(rr.message || '') + '</span></div>';
    }).join('');
    box.style.display = 'block';
    box.innerHTML = html;
}

function runFcImport() {
    // If the button is in "Done" state (after a clean success), this click completes the modal
    // instead of re-importing — prevents accidental double imports.
    var _modeBtn = document.getElementById('fc-import-run-btn');
    if (_modeBtn && _modeBtn.dataset.mode === 'done') { _fcImportDone(); return; }

    var res = _fcResolveImportMarketplace();
    if (!_fcImportResolved) { _fcRenderImportError((res && res.error) ? res.error : 'Select Country and Marketplace first.'); return; }
    var yearEl = document.getElementById('fc-import-year');
    var year = yearEl ? String(yearEl.value || '').trim() : '';
    if (!year) { _fcRenderImportError('Year is required.'); return; }
    var fileEl = document.getElementById('fc-import-file');
    if (!fileEl || !fileEl.files || !fileEl.files.length) { alert('Please choose a CSV file first.'); return; }
    if (!(window.KM && window.KM.DB && window.KM.DB.importFcRegularForecastBatch)) { alert('Import API is not available.'); return; }

    var meta = _fcImportResolved;
    var runBtn = document.getElementById('fc-import-run-btn');
    var file = fileEl.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        var cells;
        try { cells = _parseFcCsv(e.target.result); } catch (err) { _fcRenderImportError('Failed to parse CSV: ' + (err && err.message ? err.message : err)); return; }
        if (!cells || cells.length < 2) { _fcRenderImportError('No data rows found (need a header row + at least one data row).'); return; }
        var headers = cells[0].map(function(h) { return String(h == null ? '' : h).trim().toLowerCase(); });
        var skuIdx = headers.indexOf('sku');
        if (skuIdx === -1) { _fcRenderImportError('CSV is missing the required "sku" header.'); return; }
        var monthIdx = {};
        FC_IMPORT_MONTHS.forEach(function(m) { monthIdx[m] = headers.indexOf(m); });

        var rows = [];
        var clientErrors = [];
        var dataRowNum = 0;
        // Accept non-negative integers/decimals only (e.g. 0, 10, 10.1, 100). Blank = 0.
        // Reject ABC / N/A / - / test / mixed text. Accepted decimals round UP (whole units).
        var NUMERIC_RE = /^\d+(\.\d+)?$/;
        for (var r = 1; r < cells.length; r++) {
            var raw = cells[r];
            var allEmpty = raw.every(function(v) { return String(v == null ? '' : v).trim() === ''; });
            if (allEmpty) continue;
            dataRowNum++;
            var sku = String(raw[skuIdx] == null ? '' : raw[skuIdx]).trim();
            var monthVals = {};
            var badMonth = null;
            for (var mi = 0; mi < FC_IMPORT_MONTHS.length; mi++) {
                var mm = FC_IMPORT_MONTHS[mi];
                var ci = monthIdx[mm];
                var v = ci === -1 ? '' : String(raw[ci] == null ? '' : raw[ci]).trim();
                if (v === '') { monthVals[mm] = 0; continue; }
                if (!NUMERIC_RE.test(v)) { badMonth = { col: mm, val: v }; break; }
                monthVals[mm] = Math.ceil(parseFloat(v)); // round up to whole units
            }
            if (badMonth) {
                clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'Non-numeric month value: ' + badMonth.col + '="' + badMonth.val + '"' });
                continue;
            }
            if (!sku) {
                clientErrors.push({ rowIndex: dataRowNum, sku: sku, status: 'error', message: 'SKU is required' });
                continue;
            }
            var obj = { sku: sku, year: year, company: meta.company, country: meta.country, marketplace: meta.marketplace, marketplace_id: meta.marketplaceId };
            FC_IMPORT_MONTHS.forEach(function(m) { obj[m] = monthVals[m]; });
            rows.push(obj);
        }

        if (rows.length === 0 && clientErrors.length === 0) { _fcRenderImportError('No data rows found.'); return; }

        if (rows.length === 0) {
            // All rows rejected client-side; show errors, nothing sent to backend.
            _fcRenderImportResult({
                summary: { total: clientErrors.length, created: 0, updated: 0, skipped: 0, error: clientErrors.length },
                results: clientErrors
            }, 0);
            return;
        }

        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Importing...'; }
        if (!_fcWriteBegin_('import')) return;      // FC-SUMMARY-R1: the existing guard, now shared
        var _imEpoch = _fcEpoch_();
        window.KM.DB.importFcRegularForecastBatch(rows, { forecastStatusDefault: 'draft', sourceDefault: 'import' })
            .then(function(result) {
                var _imOutcome = _fcClassifyWrite_(result);
                if (_imOutcome === FC_WRITE_.SUCCESS) _fcReceipt_('Import Forecast', rows.length, result);
                _fcWriteEnd_('import', _imOutcome);
                if (!_fcOwns_(_imEpoch)) { _fcWriteState_['import'] = FC_WRITE_.UNMOUNTED; return; }
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
                // An unreadable answer is NOT an import failure — it is an unknown outcome, and the
                // remedy offered is a read, never a second import.
                if (_imOutcome === FC_WRITE_.UNKNOWN) { _fcUnknownOutcome_('import', null); return; }
                if (_imOutcome === FC_WRITE_.REFUSAL) {
                    _fcRenderImportError(result && result.error ? result.error : 'Import failed. API may not be configured.');
                    return;
                }
                var data = result.data || {};
                var s = data.summary || { total: 0, created: 0, updated: 0, skipped: 0, error: 0 };
                var mergedSummary = {
                    total: (s.total || 0) + clientErrors.length,
                    created: s.created || 0,
                    updated: s.updated || 0,
                    skipped: s.skipped || 0,
                    error: (s.error || 0) + clientErrors.length
                };
                var mergedResults = clientErrors.concat(data.results || []);
                _fcRenderImportResult({ summary: mergedSummary, results: mergedResults }, 0);
                // Re-render the Regular Forecast table. Workspace: scoped fcSummary re-read (the primary render ignores
                // the broad cache the import wrapper reloaded); Legacy: render from the reloaded cache.
                fcPaginationState.currentPage = 1;
                _fcAfterWriteScoped_(FC_SLICE_.REGULAR, function () { renderFcRegularTable(); });
                // Clean success (no errors) → switch the action button to "Done" (completion action).
                // Any errors → keep it as "Import" so the user can fix and retry.
                if (mergedSummary.error === 0 && runBtn) {
                    runBtn.textContent = 'Done';
                    runBtn.dataset.mode = 'done';
                    runBtn.disabled = false;
                }
            })
            .catch(function(err) {
                // FC-SUMMARY-R2B-A — the same four-way classification the other five controls use.
                var _imProven = _fcZeroWriteProven_(err);
                _fcWriteEnd_('import', _imProven ? FC_WRITE_.REFUSAL : FC_WRITE_.UNKNOWN);
                if (!_fcOwns_(_imEpoch)) { _fcWriteState_['import'] = FC_WRITE_.UNMOUNTED; return; }
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Import'; }
                if (_imProven) _fcZeroWriteRefusal_('import', err);
                else _fcUnknownOutcome_('import', err);
                _fcRenderImportError(err && err.message ? err.message : 'Import request failed.');
            });
    };
    reader.onerror = function() { _fcRenderImportError('Could not read the selected file.'); };
    reader.readAsText(file);
}

// Completion action for the "Done" state: close modal, clear result/file, reset button.
function _fcImportDone() {
    var resultEl = document.getElementById('fc-import-result');
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    var fileEl = document.getElementById('fc-import-file');
    if (fileEl) fileEl.value = '';
    var runBtn = document.getElementById('fc-import-run-btn');
    if (runBtn) { runBtn.textContent = 'Import'; runBtn.dataset.mode = ''; runBtn.disabled = false; }
    // Data was already refreshed on successful import; re-render defensively to be safe.
    if (typeof renderFcRegularTable === 'function') {
        fcPaginationState.currentPage = 1;
        renderFcRegularTable();
    }
    closeFcImportModal();
}

window.openFcImportModal = openFcImportModal;
window.closeFcImportModal = closeFcImportModal;
window.onFcImportCountryChange = onFcImportCountryChange;
window.onFcImportMarketplaceChange = onFcImportMarketplaceChange;
window.downloadFcImportTemplate = downloadFcImportTemplate;
window.runFcImport = runFcImport;

// ========================================
// Lifecycle 註冊
// ========================================
// Ensure the FC Summary markup is present before initFcSummaryPage runs.
// Idempotent: if #fc-summary-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureFcSummaryMarkup() {
    if (document.getElementById('fc-summary-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('fc-summary', 'assets/html/pages/fc-summary.html', '#fc-summary-mount')
            .then(function() {
                if (!document.getElementById('fc-summary-section')) {
                    console.warn('[FCSummary] partial loaded but #fc-summary-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[FCSummary] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[FCSummary] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}

if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('fc-summary-section', {
        mount() {
            console.log('[FCSummary] mount');
            // Markup is partial-loaded (Phase 3-4). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open) and init.
            _ensureFcSummaryMarkup().then(function() {
                var sec = document.getElementById('fc-summary-section');
                if (sec) sec.classList.add('active');
                // Wire tabs/search/pagination/modal-overlay once now that the markup exists
                // (the initial DOMContentLoaded ran before the partial was injected).
                _fcSummaryStaticInit();
                if (window.initFcSummaryPage) {
                    window.initFcSummaryPage();
                }
            });
        },
        unmount() {
            console.log('[FCSummary] unmount');
        }
    });
}
