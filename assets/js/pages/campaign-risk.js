// ========================================
// Campaign Risk Tracker (Promotion Risk)
// ========================================

// --- State ---
// Rebuilt 2026-07-23: the SKU universe is now sourced from the real `marketplace_skus` table (scoped by
// company + country + marketplace + active status), NOT from window globals or a hardcoded mock, and NO
// site is defaulted — nothing loads until Country + Marketplace (+ Company) resolve to a full scope.
const CampaignRiskState = {
    country: '',            // no default (was 'US')
    marketplaceId: '',      // canonical site identity (C) — the dropdown value; resolves company+marketplace
    marketplace: '',        // display string, DERIVED from the selected marketplace_id (downstream compares)
    company: '',            // DERIVED from marketplace_id (visible Company filter removed, D); never user-picked
    selectedCategories: [], // empty = all
    selectedSeries: [],     // empty = all
    selectedRisk: 'all',
    page: 1,
    pageSize: 25
};
var _crLoadToken = 0;                 // race guard: a country/marketplace switch bumps this; only the latest render wins
var _crViewState = 'no-scope';        // 'no-scope' | 'no-sku' | 'ready' | 'error'

// --- Helpers ---
function _crEqv(a, b) { return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase(); }
function _crActive(status) { var s = String(status == null ? '' : status).trim().toLowerCase(); return s === '' || s === 'active'; }
// F1-7J-A3 · bounded scoped read cutover. Canonical mode sources the 5 tables Campaign Risk reads
// (campaigns, campaign_sku_lines, marketplace_skus, sku_details, marketplaces) from ONE bounded getTable-based scoped read
// (KM.DB.loadScopedTables) — NO whole-DB loadOperationDb, NO app-prime dependency. Kill switch:
// window.KM_SCOPED_PAGE_READS = false → Legacy broad-cache. The scoped object is _opDbCache-shaped so `_crDB()` returns a
// thin shim whose getters read the read-model (BEFORE == AFTER: same normalizers + filters as the broad getters).
var _crReadModel = null;   // scoped read-model (normalizeOperationDb-shaped) or null = Legacy
var _CR_SHIM = null;
function _crScopedActive() {
    return typeof window !== 'undefined' && window.KM_SCOPED_PAGE_READS !== false &&
        window.KM && window.KM.DB && typeof window.KM.DB.loadScopedTables === 'function' &&
        window.KM.DB.getDataSourceMode && window.KM.DB.getDataSourceMode() === 'google-sheet';
}
function _crDB() {
    if (_crReadModel) {
        if (!_CR_SHIM) _CR_SHIM = {
            getSkuDetails: function () { return _crReadModel.skuDetails || []; },
            getMarketplaceSkus: function () { return _crReadModel.marketplaceSkus || []; },
            getCampaigns: function () { return _crReadModel.campaigns || []; },
            getCampaignSkuLines: function () { return _crReadModel.campaignSkuLines || []; },
            getMarketplaces: function () { return _crReadModel.marketplaces || []; }
        };
        return _CR_SHIM;
    }
    return (window.KM && window.KM.DB) || {};
}
function crScopeReady() { var s = CampaignRiskState; return !!(s.country && s.marketplace && s.company); }
function _crEsc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// --- User-added promotion overlay ---
// Authoritative promotions come from campaigns + campaign_sku_lines (read-only join below). This overlay
// holds promotions the user ADDS on this page, keyed by marketplace_sku_id, persisted locally until a real
// campaign write path (upsertCampaign / upsertCampaignSkuLines) is wired — see the completion report. It is
// seeded EMPTY (no fabricated promo rows).
const LOCALSTORAGE_KEY = 'km_campaign_promotion_records_v3';
function normalizePromotionRecord(rec) {
    const duration = rec.duration || (rec.startDate && rec.endDate ? calculatePromotionDuration(rec.startDate, rec.endDate) : 0);
    const discountPercent = rec.discountPercent || (rec.regularPrice > 0 ? Math.round((1 - rec.promoPrice / rec.regularPrice) * 1000) / 10 : 0);
    return Object.assign({}, rec, {
        marketplaceSkuId: rec.marketplaceSkuId || '',
        company: rec.company || '',
        source: 'overlay',
        duration, discountPercent,
        lps: rec.lps || false,
        specialCondition: rec.specialCondition || '',
        createdAt: rec.createdAt || new Date().toISOString(),
        updatedAt: rec.updatedAt || ''
    });
}
function loadPromotionRecords() {
    try { const stored = localStorage.getItem(LOCALSTORAGE_KEY); if (stored) return JSON.parse(stored).map(normalizePromotionRecord); }
    catch (e) { console.warn('[CampaignRisk] overlay load failed:', e); }
    return [];   // empty by default — no mock promotions
}
function savePromotionRecords() {
    try { localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(promotionMockData)); } catch (e) { console.warn('[CampaignRisk] overlay save failed:', e); }
}
let promotionMockData = loadPromotionRecords();

// --- SKU universe: marketplace_skus (scoped) JOIN sku_details (read-only for name/image/category/series) ---
function _crSkuDetailsMap() {
    var map = {};
    ((_crDB().getSkuDetails && _crDB().getSkuDetails()) || []).forEach(function (d) {
        if (d.sku) map[d.sku] = { productName: d.productName || '', image: d.image || '', category: d.category || '', series: d.series || '' };
    });
    return map;
}
// The scoped, ACTIVE site-SKU list. Uniqueness key = marketplace_sku_id (never plain sku). Front-end
// filter of the cached whole-table array (the adapter has no scoped GET — see report §9).
function getSkuMasterData() {
    if (!crScopeReady()) return [];
    var s = CampaignRiskState, sd = _crSkuDetailsMap(), out = [], seen = {};
    ((_crDB().getMarketplaceSkus && _crDB().getMarketplaceSkus()) || []).forEach(function (m) {
        if (!_crEqv(m.country, s.country) || !_crEqv(m.marketplace, s.marketplace) || !_crEqv(m.company, s.company)) return;
        if (!_crActive(m.marketplaceSkuStatus)) return;
        var id = m.marketplaceSkuId || ('MS::' + m.company + '::' + m.country + '::' + m.marketplace + '::' + m.sku);
        if (seen[id]) return; seen[id] = 1;
        var d = sd[m.sku] || {};
        out.push({
            marketplaceSkuId: id, sku: m.sku, siteSku: m.siteSku || '',
            company: m.company, country: m.country, marketplace: m.marketplace,
            marketplaceProductId: m.marketplaceProductId || '',
            regularPrice: m.regularPrice || 0, msrp: m.msrp || 0,
            productName: d.productName || '', image: d.image || '', category: d.category || '', series: d.series || ''
        });
    });
    return out;
}
// Compat shim: the Add-Promotion batch/lookup code reads this; it now returns the scoped universe.
function getAllSkuDetails() { return getSkuMasterData(); }

// --- Promotions for the current scope: real campaigns + campaign_sku_lines, merged with the overlay ---
// Each promo is normalized to { marketplaceSkuId, sku, startDate, endDate, eventFlag, source }. Real lines
// join campaign_sku_lines.campaignId → campaigns (for company/country/marketplace/dates/eventFlag), and
// campaign_sku_lines.marketplaceSkuId → marketplace_skus (canonical), sku as Master-SKU fallback.
function _crScopedPromotions() {
    if (!crScopeReady()) return [];
    var s = CampaignRiskState;
    var out = [];
    var camps = (_crDB().getCampaigns && _crDB().getCampaigns()) || [];
    var lines = (_crDB().getCampaignSkuLines && _crDB().getCampaignSkuLines()) || [];
    var campById = {}; camps.forEach(function (c) { campById[c.campaignId] = c; });
    lines.forEach(function (l) {
        var c = campById[l.campaignId]; if (!c) return;
        if (!_crEqv(c.country, s.country) || !_crEqv(c.marketplace, s.marketplace) || !_crEqv(c.company, s.company)) return;
        if (l.lineStatus && String(l.lineStatus).toLowerCase() === 'cancelled') return;
        out.push({ marketplaceSkuId: l.marketplaceSkuId || '', sku: l.sku || '', startDate: c.startDate || '', endDate: c.endDate || '', eventFlag: c.eventFlag || c.majorEventFlag || 'Normal', source: 'campaign' });
    });
    // Overlay (user-added) promotions scoped by company+country+marketplace.
    promotionMockData.forEach(function (p) {
        if (!_crEqv(p.country, s.country) || !_crEqv(p.marketplace, s.marketplace)) return;
        if (p.company && !_crEqv(p.company, s.company)) return;
        out.push({ marketplaceSkuId: p.marketplaceSkuId || '', sku: p.sku || '', startDate: p.startDate || '', endDate: p.endDate || '', eventFlag: p.eventFlag || 'Normal', source: 'overlay' });
    });
    return out;
}
function _crValidDate(d) { if (!d) return false; var t = new Date(d); return !isNaN(t.getTime()); }

// --- Risk Calculation ---
function daysBetweenInclusive(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    return Math.max(0, Math.floor((e - s) / 86400000) + 1);
}

const ANNUAL_EVENTS = ['Prime Day', 'BFCM', 'Fall Prime'];

// Match promos to a site-SKU by marketplace_sku_id (canonical); fall back to plain sku only when the
// promo carries no marketplace_sku_id. This prevents same-SKU cross-country/company contamination.
function _crMatchPromos(promos, marketplaceSkuId, sku) {
    return promos.filter(function (p) {
        if (p.marketplaceSkuId) return p.marketplaceSkuId === marketplaceSkuId;
        return sku && p.sku === sku;
    });
}

// Risk formula (UNCHANGED math — trailing-90-day + committed-future promo-days; ≥29 High, ≥15 Watch).
// Only the INPUT selection changed: real+overlay promos matched by marketplace_sku_id. A promotion that
// exists but lacks a parseable date range → "Missing Data" (never silently Safe, per G.5).
function calculateSkuRisk(marketplaceSkuId, sku, promosAll) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 90);

    const promos = _crMatchPromos(promosAll || _crScopedPromotions(), marketplaceSkuId, sku);

    let ninetyDayDays = 0;
    let futureDays = 0;
    let annualEventDays = 0;
    let totalPromos = promos.length;

    if (promos.some(function (p) { return !_crValidDate(p.startDate) || !_crValidDate(p.endDate); })) {
        return { ninetyDayDays: 0, futureDays: 0, annualEventDays: 0, riskLevel: 'Missing Data', lps: '—', totalPromos: totalPromos, missing: true };
    }

    promos.forEach(p => {
        const pStart = new Date(p.startDate);
        const pEnd = new Date(p.endDate);
        const isAnnual = ANNUAL_EVENTS.includes(p.eventFlag);

        if (isAnnual) {
            // Annual events: count days if within future
            if (pEnd >= today) {
                const effStart = pStart > today ? pStart : today;
                annualEventDays += daysBetweenInclusive(effStart, pEnd);
            }
        } else {
            // 90-day window (past)
            const effStart90 = pStart > windowStart ? pStart : windowStart;
            const effEnd90 = pEnd < today ? pEnd : new Date(today.getTime() - 86400000);
            if (effStart90 <= effEnd90) {
                ninetyDayDays += daysBetweenInclusive(effStart90, effEnd90);
            }
            // Future promo days
            if (pEnd >= today) {
                const effStartFuture = pStart > today ? pStart : today;
                futureDays += daysBetweenInclusive(effStartFuture, pEnd);
            }
        }
    });

    const totalCommitted = ninetyDayDays + futureDays;
    let riskLevel = 'Safe';
    if (totalCommitted >= 29) riskLevel = 'High Risk';
    else if (totalCommitted >= 15) riskLevel = 'Watch';

    const lps = totalCommitted >= 29 ? 'Yes' : '\u2014';

    return { ninetyDayDays, futureDays, annualEventDays, riskLevel, lps, totalPromos };
}

// --- Filter Helpers ---
function getCategories() {
    const skus = getSkuMasterData();
    const cats = [...new Set(skus.map(s => s.category).filter(Boolean))];
    return cats.sort();
}

function getSeriesForCategory(category) {
    const skus = getSkuMasterData();
    const filtered = category === 'all' ? skus : skus.filter(s => s.category === category);
    const series = [...new Set(filtered.map(s => s.series).filter(Boolean))];
    return series.sort();
}

// --- Render Functions ---
function renderCampaignRiskTracker() {
    renderRiskKPIs();
    renderRiskTable();
}

function renderRiskKPIs() {
    const container = document.getElementById('cr-kpi-cards');
    if (!container) return;
    let safe = 0, watch = 0, high = 0;
    // Neutral placeholders (all 0) until a full site scope is selected.
    if (crScopeReady() && _crViewState !== 'error') {
        const results = getFilteredRiskResults();
        results.forEach(r => {
            if (r.riskLevel === 'Safe') safe++;
            else if (r.riskLevel === 'Watch') watch++;
            else if (r.riskLevel === 'High Risk') high++;
            // 'Missing Data' is deliberately counted in NONE of the three cards (never as Safe).
        });
    }
    container.innerHTML = `
        <div class="cr-kpi-card cr-kpi-card--safe ${CampaignRiskState.selectedRisk === 'Safe' ? 'is-active' : ''}" onclick="filterByRisk('Safe')">
            <div class="cr-kpi-value">${safe}</div>
            <div class="cr-kpi-label">Safe to Promote</div>
        </div>
        <div class="cr-kpi-card cr-kpi-card--watch ${CampaignRiskState.selectedRisk === 'Watch' ? 'is-active' : ''}" onclick="filterByRisk('Watch')">
            <div class="cr-kpi-value">${watch}</div>
            <div class="cr-kpi-label">Watch / Warning</div>
        </div>
        <div class="cr-kpi-card cr-kpi-card--high ${CampaignRiskState.selectedRisk === 'High Risk' ? 'is-active' : ''}" onclick="filterByRisk('High Risk')">
            <div class="cr-kpi-value">${high}</div>
            <div class="cr-kpi-label">High Risk / Stop</div>
        </div>
    `;
}

// Category / Series filters — two single-select SHARED Tab Rails (.km-tab-rail). Category is row 1,
// Series row 2; each keeps an "All" option + Name/Count badge. Series cascades from the selected
// Category. selectedCategories/selectedSeries stay arrays ([] = all, [value] = one) so the downstream
// getFilteredRiskResults() / _crResetScopeFilters() are untouched — only the picker UI changed.
function _crRailTabHtml(name, count, active, handler) {
    var safe = _crEsc(name);
    return '<button type="button" class="km-tab-rail__tab' + (active ? ' is-active' : '') + '" data-value="' + safe +
        '" onclick="' + handler + '(this.getAttribute(\'data-value\'))">' +
        '<span class="km-tab-rail__label">' + safe + '</span>' +
        '<span class="km-tab-rail__count">' + count + '</span></button>';
}

// SKUs after the currently-selected Category (single-select) is applied — the Series rail's options
// and counts cascade from this scope, so choosing a Category narrows the Series rail.
function _crSkuScope() {
    var skus = getSkuMasterData();
    var cat = CampaignRiskState.selectedCategories;
    if (cat && cat.length === 1) skus = skus.filter(function (s) { return s.category === cat[0]; });
    return skus;
}

function renderRiskFilters() {
    var catRail = document.getElementById('cr-category-rail');
    var serRail = document.getElementById('cr-series-rail');
    if (!catRail || !serRail) return;

    var allSkus = getSkuMasterData();
    var selCat = CampaignRiskState.selectedCategories;
    var activeCat = (selCat && selCat.length === 1) ? selCat[0] : 'All';

    // Category rail — All + each category; count = SKUs in that category (whole scope, so selecting a
    // category never zeroes the other category counts).
    var categories = getCategories();
    var catTabs = [{ name: 'All', count: allSkus.length }].concat(categories.map(function (c) {
        return { name: c, count: allSkus.filter(function (s) { return s.category === c; }).length };
    }));
    catRail.innerHTML = catTabs.map(function (t) {
        return _crRailTabHtml(t.name, t.count, t.name === activeCat, 'crSelectCategory');
    }).join('');

    // Series rail — cascades from the selected category. Drop an incompatible series selection to All.
    var seriesList = getSeriesForCategory(activeCat === 'All' ? 'all' : activeCat);
    var selSer = CampaignRiskState.selectedSeries;
    if (selSer && selSer.length === 1 && seriesList.indexOf(selSer[0]) === -1) {
        CampaignRiskState.selectedSeries = [];
        selSer = CampaignRiskState.selectedSeries;
    }
    var activeSer = (selSer && selSer.length === 1) ? selSer[0] : 'All';
    var scopeSkus = _crSkuScope();
    var serTabs = [{ name: 'All', count: scopeSkus.length }].concat(seriesList.map(function (s) {
        return { name: s, count: scopeSkus.filter(function (x) { return x.series === s; }).length };
    }));
    serRail.innerHTML = serTabs.map(function (t) {
        return _crRailTabHtml(t.name, t.count, t.name === activeSer, 'crSelectSeries');
    }).join('');

    if (window.KM && window.KM.ui && window.KM.ui.tabRail) {
        window.KM.ui.tabRail.enhance(catRail);
        window.KM.ui.tabRail.enhance(serRail);
        window.KM.ui.tabRail.scrollActiveIntoView(catRail);
        window.KM.ui.tabRail.scrollActiveIntoView(serRail);
    }
}

// Category tab click — single-select. Cascades the Series rail (drops an incompatible series), then
// re-renders the rails + tracker (page → 1).
function crSelectCategory(cat) {
    CampaignRiskState.selectedCategories = (cat === 'All') ? [] : [cat];
    var seriesList = getSeriesForCategory(cat === 'All' ? 'all' : cat);
    if (CampaignRiskState.selectedSeries.length === 1 && seriesList.indexOf(CampaignRiskState.selectedSeries[0]) === -1) {
        CampaignRiskState.selectedSeries = [];
    }
    CampaignRiskState.page = 1;
    renderRiskFilters();
    renderCampaignRiskTracker();
}
window.crSelectCategory = crSelectCategory;

// Series tab click — single-select within the current category scope.
function crSelectSeries(series) {
    CampaignRiskState.selectedSeries = (series === 'All') ? [] : [series];
    CampaignRiskState.page = 1;
    renderRiskFilters();
    renderCampaignRiskTracker();
}
window.crSelectSeries = crSelectSeries;

// Module-scoped refs so the document listeners can be removed (idempotent + lifecycle unmount).
var _crDocClick = null;
var _crDocKeydown = null;

function _bindCrDocListeners() {
    _unbindCrDocListeners(); // remove any existing pair first → never stack
    _crDocClick = function(e) {
        var root = document.getElementById('campaign-risk-section');
        if (root && !root.contains(e.target)) {
            root.querySelectorAll('.cr-dropdown-panel').forEach(function(p) { p.classList.remove('is-open'); });
        }
    };
    _crDocKeydown = function(e) {
        if (e.key === 'Escape') {
            var root = document.getElementById('campaign-risk-section');
            if (root) root.querySelectorAll('.cr-dropdown-panel').forEach(function(p) { p.classList.remove('is-open'); });
        }
    };
    document.addEventListener('click', _crDocClick);
    document.addEventListener('keydown', _crDocKeydown);
}

function _unbindCrDocListeners() {
    if (_crDocClick) { document.removeEventListener('click', _crDocClick); _crDocClick = null; }
    if (_crDocKeydown) { document.removeEventListener('keydown', _crDocKeydown); _crDocKeydown = null; }
}


function getFilteredRiskResults() {
    let skus = getSkuMasterData();
    if (CampaignRiskState.selectedCategories.length > 0) {
        skus = skus.filter(s => CampaignRiskState.selectedCategories.includes(s.category));
    }
    if (CampaignRiskState.selectedSeries.length > 0) {
        skus = skus.filter(s => CampaignRiskState.selectedSeries.includes(s.series));
    }
    var promosAll = _crScopedPromotions();   // compute once per render (not per SKU)
    return skus.map(s => Object.assign({}, s, calculateSkuRisk(s.marketplaceSkuId, s.sku, promosAll)));
}

function renderRiskTable() {
    const fixedBody = document.getElementById('cr-table-fixed-body');
    const scrollBody = document.getElementById('cr-table-scroll-body');
    const pagination = document.getElementById('cr-pagination');
    if (!fixedBody || !scrollBody) return;
    const msg = function (html, cls) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div class="cr-empty-state ' + (cls || '') + '">' + html + '</div>';
        if (pagination) pagination.innerHTML = '';
    };

    // STATE 1 — no site scope selected yet (guided empty state; no SKU query is run).
    if (!crScopeReady()) { msg('Select a country and marketplace to view promotion risk.'); return; }
    // STATE 4 — API/load error (set by the loader). Show error + Retry, never treat as empty data.
    if (_crViewState === 'error') { msg('Could not load promotion data. <button type="button" class="cr-btn cr-btn--small" onclick="crReload()">Retry</button>', 'cr-empty-state--error'); return; }

    const master = getSkuMasterData();
    // STATE 2 — the site has no active marketplace SKUs.
    if (master.length === 0) { msg('No active marketplace SKUs were found for this site.'); return; }

    let results = getFilteredRiskResults();
    if (CampaignRiskState.selectedRisk !== 'all') results = results.filter(r => r.riskLevel === CampaignRiskState.selectedRisk);

    const total = results.length;
    const totalPages = Math.ceil(total / CampaignRiskState.pageSize) || 1;
    if (CampaignRiskState.page > totalPages) CampaignRiskState.page = 1;
    const start = (CampaignRiskState.page - 1) * CampaignRiskState.pageSize;
    const pageData = results.slice(start, start + CampaignRiskState.pageSize);

    // Category/Series (or risk-card) filters excluded everything — but the site DOES have SKUs.
    if (total === 0) { msg('No SKUs match the current filters.'); return; }

    // STATE 3 (SKUs present, some/all with 0 promotions) is a normal render: rows show, Total Promos = 0.
    fixedBody.innerHTML = pageData.map(r => `
        <div class="fixed-row">${_crEsc(r.sku)}</div>
    `).join('');

    scrollBody.innerHTML = pageData.map(r => {
        const riskClass = r.riskLevel === 'Safe' ? 'cr-risk--safe'
            : r.riskLevel === 'Watch' ? 'cr-risk--watch'
            : r.riskLevel === 'Missing Data' ? 'cr-risk--missing' : 'cr-risk--high';
        const img = r.image
            ? `<img class="cr-img" src="${_crEsc(r.image)}" alt="" loading="lazy" onerror="this.style.display='none';this.parentNode.innerHTML='<div class=\\'cr-img-placeholder\\'>IMG</div>'">`
            : `<div class="cr-img-placeholder">IMG</div>`;
        return `
        <div class="scroll-row" data-mid="${_crEsc(r.marketplaceSkuId)}">
            <div class="scroll-cell cr-cell--sitesku">${_crEsc(r.siteSku || '—')}</div>
            <div class="scroll-cell cr-cell--img">${img}</div>
            <div class="scroll-cell cr-cell--name">${_crEsc(r.productName || '—')}</div>
            <div class="scroll-cell">${r.missing ? '—' : r.ninetyDayDays}</div>
            <div class="scroll-cell">${r.missing ? '—' : r.futureDays}</div>
            <div class="scroll-cell">${r.missing ? '—' : (r.annualEventDays || 0)}</div>
            <div class="scroll-cell">${r.lps}</div>
            <div class="scroll-cell ${riskClass}">${r.riskLevel}</div>
            <div class="scroll-cell">${r.totalPromos}</div>
        </div>
        `;
    }).join('');

    if (pagination) {
        pagination.innerHTML = `
            <span class="cr-page-info">Showing ${start + 1}-${Math.min(start + CampaignRiskState.pageSize, total)} of ${total} SKUs</span>
            <div class="cr-page-controls">
                <button class="cr-page-btn" onclick="crPrevPage()" ${CampaignRiskState.page <= 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                <span class="cr-page-num">Page ${CampaignRiskState.page} of ${totalPages}</span>
                <button class="cr-page-btn" onclick="crNextPage()" ${CampaignRiskState.page >= totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
            </div>
        `;
    }
}

// --- Site scope: Country -> Marketplace -> Company cascade (derived from marketplace_skus) ---
// No site is defaulted; the SKU query runs only after country + marketplace (+ company) resolve.
function _crActiveMpSkus() {
    return ((_crDB().getMarketplaceSkus && _crDB().getMarketplaceSkus()) || []).filter(function (m) { return _crActive(m.marketplaceSkuStatus); });
}
// Active marketplaces from the `marketplaces` master (canonical site identity — carries marketplace_id +
// display name + company). Company is derived from this, so the visible Company filter is removed (D).
function _crActiveMarketplaceMasters() {
    return ((_crDB().getMarketplaces && _crDB().getMarketplaces()) || []).filter(function (m) {
        if (!m.marketplaceId) return false;
        var s = String(m.status == null ? '' : m.status).trim().toLowerCase();
        return s === '' || s === 'active' || s === 'true' || s === 'enabled' || s === '1' || s === 'yes';
    });
}
function _crResolveMarketplaceId(id) {
    if (id == null || id === '') return null;
    return _crActiveMarketplaceMasters().filter(function (m) { return String(m.marketplaceId) === String(id); })[0] || null;
}

// Build the Country <select> from distinct active marketplace_skus countries. Resets marketplace/company.
function populateCrSiteFilters() {
    var countrySel = document.getElementById('cr-country');
    if (!countrySel) return;
    var active = _crActiveMpSkus();
    var countries = [];
    active.forEach(function (m) { if (m.country && countries.indexOf(m.country) === -1) countries.push(m.country); });
    countries.sort();
    var prev = CampaignRiskState.country;
    countrySel.innerHTML = '<option value="">Select Country</option>' +
        countries.map(function (c) { return '<option value="' + _crEsc(c) + '">' + _crEsc(c) + '</option>'; }).join('');
    countrySel.value = (prev && countries.indexOf(prev) !== -1) ? prev : '';
    refreshCrMarketplaceOptions();
}

// Marketplaces available for the chosen country (active). CANONICAL v4 (C/D): option VALUE = marketplace_id,
// LABEL = marketplace_display_name (with a company hint when a country has more than one company on the same
// marketplace — e.g. KM vs ResUS on US/Amazon become two distinct options). Company is DERIVED from the
// selected marketplace_id, so there is no separate Company selector. Falls back to the marketplace_skus
// display-string list only when the `marketplaces` master is unavailable (e.g. demo).
function refreshCrMarketplaceOptions() {
    var mpSel = document.getElementById('cr-marketplace');
    if (!mpSel) return;
    var country = CampaignRiskState.country;
    if (!country) {
        mpSel.innerHTML = '<option value="">Select Marketplace</option>';
        mpSel.disabled = true; CampaignRiskState.marketplaceId = ''; CampaignRiskState.marketplace = ''; CampaignRiskState.company = '';
        return;
    }
    // marketplace_ids present in active marketplace_skus for this country (only sites that actually have SKUs).
    var idsInSkus = {};
    _crActiveMpSkus().forEach(function (m) { if (_crEqv(m.country, country) && m.marketplaceId) idsInSkus[String(m.marketplaceId)] = 1; });
    var masters = _crActiveMarketplaceMasters().filter(function (m) {
        return _crEqv(m.country, country) && (Object.keys(idsInSkus).length === 0 || idsInSkus[String(m.marketplaceId)]);
    });

    mpSel.disabled = false;

    if (!masters.length) {
        // Fallback (no master): legacy distinct display-string list; company auto-derived from marketplace_skus.
        var mps = [];
        _crActiveMpSkus().forEach(function (m) { if (_crEqv(m.country, country) && m.marketplace && mps.indexOf(m.marketplace) === -1) mps.push(m.marketplace); });
        mps.sort();
        mpSel.innerHTML = '<option value="">Select Marketplace</option>' +
            mps.map(function (m) { return '<option value="str:' + _crEsc(m) + '">' + _crEsc(m) + '</option>'; }).join('');
        if (mps.length === 1) { mpSel.value = 'str:' + mps[0]; _crApplyMarketplaceSelection('str:' + mps[0]); }
        else { mpSel.value = ''; _crApplyMarketplaceSelection(''); }
        return;
    }

    // Disambiguate label when >1 company shares the same (country, marketplace) display string.
    var byDisplay = {};
    masters.forEach(function (m) { var k = (m.marketplaceDisplayName || m.marketplace); byDisplay[k] = (byDisplay[k] || 0) + 1; });
    masters.sort(function (a, b) { return String(a.marketplaceDisplayName || a.marketplace).localeCompare(String(b.marketplaceDisplayName || b.marketplace)); });

    mpSel.innerHTML = '<option value="">Select Marketplace</option>' +
        masters.map(function (m) {
            var base = m.marketplaceDisplayName || m.marketplace;
            var label = _crEsc(base) + (byDisplay[base] > 1 && m.company ? ' (' + _crEsc(m.company) + ')' : '');
            return '<option value="' + _crEsc(m.marketplaceId) + '">' + label + '</option>';
        }).join('');

    var prevId = CampaignRiskState.marketplaceId;
    if (prevId && masters.some(function (m) { return String(m.marketplaceId) === String(prevId); })) {
        mpSel.value = prevId; _crApplyMarketplaceSelection(prevId);
    } else if (masters.length === 1) {
        mpSel.value = masters[0].marketplaceId; _crApplyMarketplaceSelection(masters[0].marketplaceId);
    } else {
        mpSel.value = ''; _crApplyMarketplaceSelection('');
    }
}

// Resolve a marketplace-dropdown value into the derived scope (marketplace_id → company + marketplace).
// A "str:" prefix marks the demo fallback (no marketplace_id available).
function _crApplyMarketplaceSelection(val) {
    if (val && val.indexOf('str:') === 0) {
        CampaignRiskState.marketplaceId = '';
        CampaignRiskState.marketplace = val.slice(4);
        // Derive company from marketplace_skus for this country + marketplace (fallback path).
        var comps = [];
        _crActiveMpSkus().forEach(function (m) { if (_crEqv(m.country, CampaignRiskState.country) && _crEqv(m.marketplace, CampaignRiskState.marketplace) && m.company && comps.indexOf(m.company) === -1) comps.push(m.company); });
        if (comps.length > 1 && window.console) console.warn('[CR] mapping integrity: multiple companies for ' + CampaignRiskState.country + '/' + CampaignRiskState.marketplace + ' without a marketplace_id — using ' + comps[0]);
        CampaignRiskState.company = comps[0] || '';
        return;
    }
    var rec = _crResolveMarketplaceId(val);
    if (!rec) { CampaignRiskState.marketplaceId = ''; CampaignRiskState.marketplace = ''; CampaignRiskState.company = ''; return; }
    CampaignRiskState.marketplaceId = String(rec.marketplaceId);
    CampaignRiskState.marketplace = rec.marketplace || '';
    CampaignRiskState.company = rec.company || '';    // company derived from marketplace_id (D)
}

function onCrCountryChange() {
    var countrySel = document.getElementById('cr-country');
    CampaignRiskState.country = countrySel ? countrySel.value : '';
    CampaignRiskState.marketplaceId = '';
    CampaignRiskState.marketplace = '';
    CampaignRiskState.company = '';
    _crResetScopeFilters();
    _crLoadToken++;                 // invalidate any prior async load
    refreshCrMarketplaceOptions();
    crRenderScoped();
}
function onCrMarketplaceChange() {
    var mpSel = document.getElementById('cr-marketplace');
    _crApplyMarketplaceSelection(mpSel ? mpSel.value : '');   // resolves marketplace_id → company + marketplace
    _crResetScopeFilters();
    _crLoadToken++;
    crRenderScoped();
}
function _crResetScopeFilters() {
    CampaignRiskState.selectedCategories = [];
    CampaignRiskState.selectedSeries = [];
    CampaignRiskState.selectedRisk = 'all';
    CampaignRiskState.page = 1;
}

// Render for the current scope. Clears prior rows FIRST (so a country switch never shows stale rows),
// rebuilds the category/series options for the new scope, updates the Add/Delete gate, then renders.
function crRenderScoped() {
    if (_crViewState !== 'error') _crViewState = crScopeReady() ? 'ready' : 'no-scope';
    renderRiskKPIs();
    renderRiskFilters();
    renderRiskTable();
    _crUpdatePromoButtonsGate();
}

// Ensure the DB cache is loaded (race-guarded), populate the country selector, then render. Sets the
// error state on failure (shown with a Retry button) — never treats a failed load as empty data.
function crReload() {
    if (_crViewState === 'error') _crViewState = 'ready';
    var done = function () { _crViewState = _crViewState === 'error' ? 'error' : (crScopeReady() ? 'ready' : 'no-scope'); populateCrSiteFilters(); crRenderScoped(); };
    // F1-7J-A3: canonical → bounded scoped read (never depends on the app prime / whole-DB cache); fail-closed error state
    // (no silent broad fallback). Legacy kill-switch retains the broad loadOperationDb.
    if (_crScopedActive()) {
        if (_crReadModel) { done(); return; }
        var tok = ++_crLoadToken;
        window.KM.DB.loadScopedTables(['campaigns', 'campaign_sku_lines', 'marketplace_skus', 'sku_details', 'marketplaces'])
            .then(function (m) { if (tok !== _crLoadToken) return; _crReadModel = m; _CR_SHIM = null; done(); })
            .catch(function () { if (tok !== _crLoadToken) return; _crViewState = 'error'; crRenderScoped(); });
        return;
    }
    if (window._opDbCache) { done(); return; }
    var token = ++_crLoadToken;
    var loader = (_crDB().loadOperationDb) || window.reloadOperationDb;
    if (!loader) { _crViewState = 'error'; crRenderScoped(); return; }
    loader({ force: true })
        .then(function () { if (token !== _crLoadToken) return; done(); })
        .catch(function () { if (token !== _crLoadToken) return; _crViewState = 'error'; crRenderScoped(); });
}

// Legacy compat — no longer used for dropdown but kept for add-promotion modal
function setCrCategory(cat) {
    CampaignRiskState.selectedCategories = cat === 'all' ? [] : [cat];
    CampaignRiskState.page = 1;
    renderCampaignRiskTracker();
}

function setCrSeries(series) {
    CampaignRiskState.selectedSeries = series === 'all' ? [] : [series];
    CampaignRiskState.page = 1;
    renderCampaignRiskTracker();
}

function filterByRisk(level) {
    CampaignRiskState.selectedRisk = CampaignRiskState.selectedRisk === level ? 'all' : level;
    CampaignRiskState.page = 1;
    renderRiskKPIs();
    renderRiskTable();
}

function crPrevPage() {
    if (CampaignRiskState.page > 1) { CampaignRiskState.page--; renderRiskTable(); }
}
function crNextPage() {
    CampaignRiskState.page++;
    renderRiskTable();
}

function crAddPromotion() {
    if (!crScopeReady()) return;   // guarded (button is also disabled)
    openAddPromotionModal();
}
function crDeletePromotions() {
    if (!crScopeReady()) return;
    openDeletePromotionModal();
}
// Enable Add / Delete Promotion only when a full site scope is selected; show the reason otherwise.
function _crUpdatePromoButtonsGate() {
    var ready = crScopeReady();
    ['cr-add-promo-btn', 'cr-del-promo-btn'].forEach(function (id) {
        var b = document.getElementById(id);
        if (!b) return;
        b.disabled = !ready;
        b.title = ready ? '' : 'Select a country and marketplace first';
    });
}

// --- Data Access ---
function getPromotionRecords() { return promotionMockData; }
function setPromotionRecords(records) { promotionMockData = records.map(normalizePromotionRecord); savePromotionRecords(); }
function addPromotionRecords(recordsToAdd) { recordsToAdd.forEach(r => promotionMockData.push(normalizePromotionRecord(r))); savePromotionRecords(); }
function deletePromotionRecordsByIds(ids) { const idSet = new Set(ids); promotionMockData = promotionMockData.filter(p => !idSet.has(p.promotionId)); savePromotionRecords(); }
function findSkuByCode(sku) { return getSkuMasterData().find(s => s.sku === sku); }
function getCategoryOptionsFromSkuMaster() { return getCategories(); }
function getSeriesOptionsByCategory(cat) { return getSeriesForCategory(cat); }

function generatePromotionId() { return 'promo_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

function generatePromotionName(sku, type) {
    const typeMap = { 'Best Deal': 'BD', 'Lightning Deal': 'LD', 'Coupon': 'CP', 'Price Discount': 'PD', 'PED': 'PED' };
    const code = typeMap[type] || 'PR';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${sku}-${code}-${date}`;
}

function isDuplicatePromotion(rec) {
    return promotionMockData.some(p =>
        p.country === rec.country && p.marketplace === rec.marketplace && p.sku === rec.sku &&
        p.startDate === rec.startDate && p.endDate === rec.endDate && p.promotionType === rec.promotionType
    );
}

function refreshCampaignRiskTracker() {
    renderRiskKPIs();
    renderRiskFilters();
    renderRiskTable();
}

// --- Add Promotion Modal ---
let crAddMode = 'single';
let crPriceGroups = [];
let crAddPreview = null;

function validatePromotionDates(startDate, endDate) {
    if (!startDate || !endDate) return { valid: false, error: 'Start Date and End Date are required.' };
    if (endDate < startDate) return { valid: false, error: 'End Date cannot be earlier than Start Date.' };
    const duration = calculatePromotionDuration(startDate, endDate);
    const warnings = [];
    if (duration > 30) warnings.push('This promotion is longer than 30 days. Please confirm if this is intended.');
    return { valid: true, duration, warnings };
}

function calculatePromotionDuration(startDate, endDate) {
    return Math.floor((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
}

// Same-site match: prefer marketplace_sku_id (canonical); fall back to country+marketplace+sku for
// overlay rows that predate the id. This keeps the same SKU in a different country/company separate.
function _crSameSite(p, rec) {
    if (rec.marketplaceSkuId && p.marketplaceSkuId) return p.marketplaceSkuId === rec.marketplaceSkuId;
    return p.country === rec.country && p.marketplace === rec.marketplace && p.sku === rec.sku;
}
function detectDuplicatePromotion(rec) {
    return promotionMockData.some(p =>
        _crSameSite(p, rec) &&
        p.startDate === rec.startDate && p.endDate === rec.endDate && p.promotionType === rec.promotionType
    );
}

function detectOverlappingPromotions(rec) {
    return promotionMockData.filter(p =>
        _crSameSite(p, rec) &&
        rec.startDate <= p.endDate && rec.endDate >= p.startDate &&
        !(p.startDate === rec.startDate && p.endDate === rec.endDate && p.promotionType === rec.promotionType)
    );
}

function calculateSkuRiskAfterAdd(marketplaceSkuId, sku, newRecords) {
    const current = calculateSkuRisk(marketplaceSkuId, sku);
    const today = new Date(); today.setHours(0,0,0,0);
    let addedFuture = 0;
    let addedAnnual = 0;
    newRecords.filter(r => r.sku === sku).forEach(r => {
        const isAnnual = ANNUAL_EVENTS.includes(r.eventFlag);
        const dur = calculatePromotionDuration(r.startDate, r.endDate);
        if (isAnnual) { addedAnnual += dur; }
        else {
            const pEnd = new Date(r.endDate);
            if (pEnd >= today) {
                const effStart = new Date(r.startDate) > today ? new Date(r.startDate) : today;
                addedFuture += daysBetweenInclusive(effStart, pEnd);
            }
        }
    });
    const newTotal = current.ninetyDayDays + current.futureDays + addedFuture;
    let newRisk = 'Safe';
    if (newTotal >= 29) newRisk = 'High Risk';
    else if (newTotal >= 15) newRisk = 'Watch';
    return { ...current, newFutureDays: current.futureDays + addedFuture, newAnnual: current.annualEventDays + addedAnnual, newTotal, newRisk, lps: newTotal >= 29 };
}

function buildPriceGroupsForBatchSelection(category, series) {
    let skus = getSkuMasterData();   // already scoped to the selected company + country + marketplace
    if (category !== 'all') skus = skus.filter(s => s.category === category);
    if (series !== 'all') skus = skus.filter(s => s.series === series);
    const groups = {};
    skus.forEach(s => {
        const regPrice = parseFloat(s.regularPrice) || parseFloat(s.msrp) || 0;   // real price from marketplace_skus
        const key = `${s.series}__${regPrice.toFixed(2)}`;
        if (!groups[key]) groups[key] = { series: s.series, category: s.category, regularPrice: regPrice, skus: [] };
        groups[key].skus.push({ sku: s.sku, productName: s.productName, marketplaceSkuId: s.marketplaceSkuId });
    });
    return Object.values(groups);
}

function openAddPromotionModal() {
    let modal = document.getElementById('cr-add-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'cr-add-modal'; modal.className = 'cr-modal-overlay'; document.body.appendChild(modal); }
    crAddMode = 'single'; crPriceGroups = []; crAddPreview = null;
    const categories = getCategoryOptionsFromSkuMaster();
    modal.innerHTML = `
        <div class="cr-modal cr-modal--wide">
            <div class="cr-modal-header"><h3>Add Promotion</h3><button class="cr-modal-close" onclick="closeAddPromotionModal()">&times;</button></div>
            <div class="cr-modal-body">
                <div class="cr-add-section"><div class="cr-add-section-title">1. Scope</div>
                    <div class="cr-scope-readout">Site: <strong>${_crEsc(CampaignRiskState.country)} / ${_crEsc(CampaignRiskState.marketplace)}${CampaignRiskState.company ? ' / ' + _crEsc(CampaignRiskState.company) : ''}</strong> <span class="cr-scope-note">(promotions are added to this site only)</span></div>
                    <input type="hidden" id="cr-add-country" value="${_crEsc(CampaignRiskState.country)}">
                    <input type="hidden" id="cr-add-marketplace" value="${_crEsc(CampaignRiskState.marketplace)}">
                    <div class="cr-form-row"><div class="cr-form-group cr-form-group--full"><label>Mode</label><div class="cr-mode-toggle"><button class="cr-mode-btn is-active" onclick="setCrAddMode('single')">Single SKU</button><button class="cr-mode-btn" onclick="setCrAddMode('batch')">Category / Series Batch</button></div></div></div>
                </div>
                <div class="cr-add-section"><div class="cr-add-section-title">2. Target</div>
                    <div id="cr-add-single-fields"><div class="cr-form-row"><div class="cr-form-group cr-form-group--full"><label>SKU *</label><select id="cr-add-sku" onchange="crOnAddSkuSelect()"><option value="">Select SKU...</option>${getSkuMasterData().map(function(s){return '<option value="'+_crEsc(s.marketplaceSkuId)+'">'+_crEsc(s.sku)+(s.siteSku?(' · '+_crEsc(s.siteSku)):'')+' — '+_crEsc(s.productName||'')+'</option>';}).join('')}</select><div id="cr-add-sku-status" class="cr-sku-status"></div></div></div></div>
                    <div id="cr-add-batch-fields" style="display:none;"><div class="cr-form-row"><div class="cr-form-group"><label>Category</label><select id="cr-add-category" onchange="crUpdateBatchSeries();crBuildGroups()"><option value="all">All Categories</option>${categories.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div><div class="cr-form-group"><label>Series</label><select id="cr-add-series" onchange="crBuildGroups()"><option value="all">All Series</option></select></div></div><div id="cr-add-batch-count" class="cr-batch-count"></div></div>
                </div>
                <div class="cr-add-section"><div class="cr-add-section-title">3. Campaign Info</div>
                    <div class="cr-form-row"><div class="cr-form-group"><label>Promotion Name</label><input type="text" id="cr-add-name" placeholder="Auto-generated if empty"></div><div class="cr-form-group"><label>Promotion Type *</label><select id="cr-add-type"><option value="">Select...</option><option value="Best Deal">Best Deal</option><option value="Lightning Deal">Lightning Deal</option><option value="Coupon">Coupon</option><option value="Price Discount">Price Discount</option><option value="PED">PED</option></select></div></div>
                    <div class="cr-form-row"><div class="cr-form-group"><label>Event Flag *</label><select id="cr-add-event"><option value="Normal">Normal</option><option value="Prime Day">Prime Day</option><option value="Fall Prime">Fall Prime</option><option value="BFCM">BFCM</option></select></div></div>
                    <div class="cr-form-row"><div class="cr-form-group"><label>Start Date *</label><input type="date" id="cr-add-start"></div><div class="cr-form-group"><label>End Date *</label><input type="date" id="cr-add-end"></div></div>
                </div>
                <div class="cr-add-section"><div class="cr-add-section-title">4. Price Setting</div>
                    <div id="cr-add-single-price"><div class="cr-form-row"><div class="cr-form-group"><label>Regular Price *</label><input type="number" id="cr-add-regular" min="0" step="0.01"></div><div class="cr-form-group"><label>Promo Price *</label><input type="number" id="cr-add-promo" min="0" step="0.01"></div></div></div>
                    <div id="cr-add-group-cards" style="display:none;"></div>
                </div>
                <div id="cr-add-preview-section" class="cr-add-section" style="display:none;"><div class="cr-add-section-title">5. Preview</div><div id="cr-add-preview"></div></div>
                <div id="cr-add-error" class="cr-form-error"></div>
                <div id="cr-add-warnings" class="cr-form-warnings"></div>
            </div>
            <div class="cr-modal-footer">
                <button class="cr-btn cr-btn--cancel" onclick="closeAddPromotionModal()">Cancel</button>
                <button class="cr-btn cr-btn--primary" id="cr-add-preview-btn" onclick="crPreviewAdd()">Preview & Validate</button>
                <button class="cr-btn cr-btn--primary" id="cr-add-submit-btn" onclick="submitAddPromotion()" style="display:none;">Confirm & Add</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
    document.getElementById('cr-add-country').value = CampaignRiskState.country;
    crUpdateBatchSeries();
}

function closeAddPromotionModal() { const m = document.getElementById('cr-add-modal'); if(m) m.style.display='none'; }

function setCrAddMode(mode) {
    crAddMode = mode;
    document.getElementById('cr-add-single-fields').style.display = mode==='single'?'':'none';
    document.getElementById('cr-add-batch-fields').style.display = mode==='batch'?'':'none';
    document.getElementById('cr-add-single-price').style.display = mode==='single'?'':'none';
    document.getElementById('cr-add-group-cards').style.display = mode==='batch'?'':'none';
    document.querySelectorAll('.cr-mode-btn').forEach(b=>b.classList.remove('is-active'));
    event.target.classList.add('is-active');
    if(mode==='batch'){crUpdateBatchSeries();crBuildGroups();}
    document.getElementById('cr-add-preview-section').style.display='none';
    document.getElementById('cr-add-preview-btn').style.display='';
    document.getElementById('cr-add-submit-btn').style.display='none';
}

function crOnAddSkuSelect() {
    const sel = document.getElementById('cr-add-sku');
    const status = document.getElementById('cr-add-sku-status');
    if (!sel || !status) return;
    const mid = sel.value;
    if (!mid) { status.innerHTML = ''; return; }
    const found = getSkuMasterData().find(s => s.marketplaceSkuId === mid);
    status.innerHTML = found ? `<span class="cr-sku-found">${_crEsc(found.sku)} — ${_crEsc(found.productName || '')}</span>` : '';
}

function crUpdateBatchSeries() {
    const cat = document.getElementById('cr-add-category')?.value||'all';
    const sel = document.getElementById('cr-add-series');
    if(!sel) return;
    const series = getSeriesForCategory(cat);
    sel.innerHTML = `<option value="all">All Series</option>${series.map(s=>`<option value="${s}">${s}</option>`).join('')}`;
}

function crBuildGroups() {
    const cat = document.getElementById('cr-add-category')?.value||'all';
    const ser = document.getElementById('cr-add-series')?.value||'all';
    crPriceGroups = buildPriceGroupsForBatchSelection(cat, ser);
    const container = document.getElementById('cr-add-group-cards');
    const countEl = document.getElementById('cr-add-batch-count');
    const totalSkus = crPriceGroups.reduce((s,g)=>s+g.skus.length,0);
    if(countEl) countEl.textContent = `${totalSkus} SKUs in ${crPriceGroups.length} price group(s)`;
    if(!container) return;
    container.innerHTML = crPriceGroups.length === 0 ? '<div style="color:#6b7280;font-size:13px;">No eligible SKUs found.</div>' :
        crPriceGroups.map((g,i)=>`
            <div class="cr-price-group-card">
                <div class="cr-pg-header"><span class="cr-pg-series">${g.series}</span><span class="cr-pg-count">${g.skus.length} SKUs</span></div>
                <div class="cr-pg-info">Regular Price: <strong>$${g.regularPrice.toFixed(2)}</strong></div>
                <div class="cr-pg-skus">${g.skus.map(s=>`<span class="cr-pg-sku-tag">${s.sku}</span>`).join('')}</div>
                <div class="cr-form-row" style="margin-top:8px;margin-bottom:0;"><div class="cr-form-group"><label>Promo Price *</label><input type="number" class="cr-pg-promo-input" data-group="${i}" min="0" step="0.01" placeholder="Enter promo price..."></div></div>
            </div>
        `).join('');
}

function crPreviewAdd() {
    const errEl = document.getElementById('cr-add-error');
    const warnEl = document.getElementById('cr-add-warnings');
    errEl.textContent = ''; warnEl.innerHTML = '';
    const country = document.getElementById('cr-add-country').value;
    const marketplace = document.getElementById('cr-add-marketplace').value;
    const type = document.getElementById('cr-add-type').value;
    const eventFlag = document.getElementById('cr-add-event').value;
    const startDate = document.getElementById('cr-add-start').value;
    const endDate = document.getElementById('cr-add-end').value;
    const name = document.getElementById('cr-add-name').value.trim();

    if(!type){errEl.textContent='Promotion Type is required.';return;}
    const dateCheck = validatePromotionDates(startDate, endDate);
    if(!dateCheck.valid){errEl.textContent=dateCheck.error;return;}

    let records = [];
    if(crAddMode==='single'){
        const mid = document.getElementById('cr-add-sku').value;
        if(!mid){errEl.textContent='Please select a SKU.';return;}
        const found = getSkuMasterData().find(s=>s.marketplaceSkuId===mid);
        if(!found){errEl.textContent='Selected SKU is not in the current site scope.';return;}
        const reg = parseFloat(document.getElementById('cr-add-regular').value);
        const promo = parseFloat(document.getElementById('cr-add-promo').value);
        if(isNaN(reg)||reg<0){errEl.textContent='Regular Price must be a valid number.';return;}
        if(isNaN(promo)||promo<0){errEl.textContent='Promo Price must be a valid number.';return;}
        if(promo>reg){errEl.textContent='Promo Price cannot be greater than Regular Price.';return;}
        records.push({sku:found.sku, marketplaceSkuId:mid, regularPrice:reg, promoPrice:promo, productName:found.productName, series:found.series||''});
    } else {
        if(crPriceGroups.length===0){errEl.textContent='No eligible SKUs found.';return;}
        const inputs = document.querySelectorAll('.cr-pg-promo-input');
        for(let i=0;i<crPriceGroups.length;i++){
            const promo = parseFloat(inputs[i]?.value);
            if(isNaN(promo)||promo<0){errEl.textContent=`Promo Price for group ${crPriceGroups[i].series} is invalid.`;return;}
            if(promo>crPriceGroups[i].regularPrice){errEl.textContent=`Promo Price for ${crPriceGroups[i].series} cannot exceed Regular Price.`;return;}
            crPriceGroups[i].skus.forEach(s=>{
                records.push({sku:s.sku, marketplaceSkuId:s.marketplaceSkuId, regularPrice:crPriceGroups[i].regularPrice, promoPrice:promo, productName:s.productName, series:crPriceGroups[i].series});
            });
        }
    }

    const warnings = [...(dateCheck.warnings||[])];
    const previewRows = [];
    let hasDuplicate = false;
    records.forEach(r=>{
        const rec = {country,marketplace,sku:r.sku,marketplaceSkuId:r.marketplaceSkuId,startDate,endDate,promotionType:type==='PED'?'Prime Exclusive Discount':type,eventFlag};
        if(detectDuplicatePromotion(rec)){hasDuplicate=true;return;}
        const overlaps = detectOverlappingPromotions(rec);
        if(overlaps.length>0) warnings.push(`${r.sku}: overlaps with existing promotion.`);
        const riskAfter = calculateSkuRiskAfterAdd(r.marketplaceSkuId, r.sku,[{...rec,promoPrice:r.promoPrice,regularPrice:r.regularPrice}]);
        previewRows.push({...r,currentRisk:riskAfter.riskLevel==='Safe'&&riskAfter.ninetyDayDays+riskAfter.futureDays<15?'Safe':riskAfter.ninetyDayDays+riskAfter.futureDays>=29?'High Risk':'Watch', newRisk:riskAfter.newRisk, newTotal:riskAfter.newTotal, lps:riskAfter.lps, current90:riskAfter.ninetyDayDays, currentFuture:riskAfter.futureDays});
    });
    if(hasDuplicate){errEl.textContent='Duplicate promotion record already exists.';return;}

    crAddPreview = {country,marketplace,type,eventFlag,startDate,endDate,name,duration:dateCheck.duration,records,previewRows,warnings};
    if(warnings.length>0) warnEl.innerHTML = warnings.map(w=>`<div class="cr-warning-item">?? ${w}</div>`).join('');

    const previewSection = document.getElementById('cr-add-preview-section');
    const previewEl = document.getElementById('cr-add-preview');
    previewSection.style.display = '';
    const shown = previewRows.slice(0,20);
    previewEl.innerHTML = `
        <div class="cr-preview-summary"><strong>${previewRows.length}</strong> SKUs | Duration: <strong>${dateCheck.duration} days</strong> | Type: <strong>${type}</strong> | Event: <strong>${eventFlag}</strong></div>
        <div class="cr-preview-table">
            <div class="cr-preview-row cr-preview-row--header"><span>SKU</span><span>Series</span><span>Reg$</span><span>Promo$</span><span>Current</span><span>New Risk</span><span>Total Days</span><span>LPS</span></div>
            ${shown.map(r=>{const rc=r.newRisk==='High Risk'?'cr-risk--high':r.newRisk==='Watch'?'cr-risk--watch':'cr-risk--safe';return`<div class="cr-preview-row"><span>${r.sku}</span><span>${r.series}</span><span>$${r.regularPrice.toFixed(2)}</span><span>$${r.promoPrice.toFixed(2)}</span><span>${r.currentRisk}</span><span class="${rc}">${r.newRisk}</span><span>${r.newTotal}</span><span>${r.lps?'Yes':'-'}</span></div>`;}).join('')}
        </div>
        ${previewRows.length>20?`<div style="font-size:12px;color:#6b7280;margin-top:8px;">Showing first 20 of ${previewRows.length} SKUs.</div>`:''}
    `;
    document.getElementById('cr-add-preview-btn').style.display='none';
    document.getElementById('cr-add-submit-btn').style.display='';
}

function submitAddPromotion() {
    if(!crAddPreview){return;}
    const {country,marketplace,type,eventFlag,startDate,endDate,name,duration,records,previewRows} = crAddPreview;
    const hasHigh = previewRows.some(r=>r.newRisk==='High Risk');
    const hasWatch = previewRows.some(r=>r.newRisk==='Watch');
    if(hasHigh){ if(!confirm('Some SKUs will become High Risk / Stop and will be marked as LPS. Continue?')) return; }
    else if(hasWatch){ if(!confirm('Some SKUs will move to Watch / Warning. Continue?')) return; }

    const newRecords = [];
    records.forEach((r,i)=>{
        const preview = previewRows.find(p=>p.sku===r.sku);
        const lps = preview?.lps || false;
        const rec = normalizePromotionRecord({
            promotionId: generatePromotionId()+'_'+i,
            campaignName: name || generatePromotionName(r.sku, type),
            country, marketplace, company: CampaignRiskState.company, sku: r.sku, marketplaceSkuId: r.marketplaceSkuId,
            promotionType: type==='PED'?'Prime Exclusive Discount':type,
            eventFlag, startDate, endDate,
            promoPrice: r.promoPrice, regularPrice: r.regularPrice,
            duration,
            lps,
            specialCondition: lps ? 'LowPriceStrategy' : '',
            createdAt: new Date().toISOString(),
            updatedAt: ''
        });
        if(!detectDuplicatePromotion(rec)){ newRecords.push(rec); }
    });
    if(newRecords.length===0){document.getElementById('cr-add-error').textContent='No records added (all duplicates).';return;}
    addPromotionRecords(newRecords);
    closeAddPromotionModal();
    refreshCampaignRiskTracker();
}


let crDeleteResults = [];
function openDeletePromotionModal() {
    let modal = document.getElementById('cr-delete-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cr-delete-modal';
        modal.className = 'cr-modal-overlay';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div class="cr-modal cr-modal--wide">
            <div class="cr-modal-header"><h3>Delete Promotions</h3><button class="cr-modal-close" onclick="closeDeletePromotionModal()">&times;</button></div>
            <div class="cr-modal-body">
                <div class="cr-scope-readout">Site: <strong>${_crEsc(CampaignRiskState.country)} / ${_crEsc(CampaignRiskState.marketplace)}${CampaignRiskState.company ? ' / ' + _crEsc(CampaignRiskState.company) : ''}</strong> <span class="cr-scope-note">(only promotions added on this page, for this site, can be deleted here)</span></div>
                <input type="hidden" id="cr-del-country" value="${_crEsc(CampaignRiskState.country)}">
                <input type="hidden" id="cr-del-marketplace" value="${_crEsc(CampaignRiskState.marketplace)}">
                <div class="cr-form-row">
                    <div class="cr-form-group"><label>SKU</label><input type="text" id="cr-del-sku" placeholder="SKU..."></div>
                </div>
                <div class="cr-form-row">
                    <div class="cr-form-group"><label>Start Date</label><input type="date" id="cr-del-start"></div>
                    <div class="cr-form-group"><label>End Date</label><input type="date" id="cr-del-end"></div>
                    <div class="cr-form-group" style="align-self:flex-end;"><button class="cr-btn cr-btn--primary" onclick="crSearchDeleteRecords()">Search</button></div>
                </div>
                <div id="cr-del-results" class="cr-del-results"></div>
                <div id="cr-del-error" class="cr-form-error"></div>
            </div>
            <div class="cr-modal-footer">
                <button class="cr-btn cr-btn--cancel" onclick="closeDeletePromotionModal()">Cancel</button>
                <button class="cr-btn cr-btn--danger" onclick="crDeleteSelected()">Delete Selected</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
    document.getElementById('cr-del-country').value = CampaignRiskState.country;
    crDeleteResults = [];
}

function closeDeletePromotionModal() {
    const modal = document.getElementById('cr-delete-modal');
    if (modal) modal.style.display = 'none';
}

function crSearchDeleteRecords() {
    const country = document.getElementById('cr-del-country').value;
    const marketplace = document.getElementById('cr-del-marketplace').value;
    const sku = document.getElementById('cr-del-sku').value.trim();
    const startDate = document.getElementById('cr-del-start').value;
    const endDate = document.getElementById('cr-del-end').value;

    // Scope-locked: only overlay (user-added) promotions for the CURRENT site are searchable/deletable.
    // Real campaign_sku_lines are read-only here (not in promotionMockData), so they can never be deleted
    // by mistake, and a Master SKU can never delete another country/company's promotion.
    var company = CampaignRiskState.company;
    crDeleteResults = promotionMockData.filter(p => {
        if (country && !_crEqv(p.country, country)) return false;
        if (marketplace && !_crEqv(p.marketplace, marketplace)) return false;
        if (company && p.company && !_crEqv(p.company, company)) return false;
        if (sku && !String(p.sku || '').toLowerCase().includes(sku.toLowerCase())) return false;
        if (startDate && p.endDate < startDate) return false;
        if (endDate && p.startDate > endDate) return false;
        return true;
    });

    const container = document.getElementById('cr-del-results');
    if (crDeleteResults.length === 0) {
        container.innerHTML = '<div class="cr-del-empty">No records found.</div>';
        return;
    }
    container.innerHTML = `
        <div class="cr-del-actions"><button class="cr-btn cr-btn--small" onclick="crSelectAllDelete(true)">Select All</button><button class="cr-btn cr-btn--small" onclick="crSelectAllDelete(false)">Clear</button></div>
        <div class="cr-del-list">
            ${crDeleteResults.map((p, i) => `
                <div class="cr-del-row">
                    <input type="checkbox" class="cr-del-check" data-idx="${i}">
                    <span class="cr-del-cell">${p.campaignName || '-'}</span>
                    <span class="cr-del-cell">${p.sku}</span>
                    <span class="cr-del-cell">${p.country}</span>
                    <span class="cr-del-cell">${p.marketplace}</span>
                    <span class="cr-del-cell">${p.promotionType}</span>
                    <span class="cr-del-cell">${p.eventFlag}</span>
                    <span class="cr-del-cell">${p.startDate}</span>
                    <span class="cr-del-cell">${p.endDate}</span>
                    <span class="cr-del-cell">$${p.promoPrice}</span>
                    <span class="cr-del-cell">$${p.regularPrice}</span>
                    <span class="cr-del-cell">${p.lps ? 'Yes' : '-'}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function crSelectAllDelete(checked) {
    document.querySelectorAll('.cr-del-check').forEach(cb => cb.checked = checked);
}

function crDeleteSelected() {
    const errEl = document.getElementById('cr-del-error');
    errEl.textContent = '';
    const checked = document.querySelectorAll('.cr-del-check:checked');
    if (checked.length === 0) { errEl.textContent = 'Please select at least one promotion to delete.'; return; }
    if (!confirm(`Are you sure you want to delete ${checked.length} promotion records?`)) return;
    const idsToDelete = [];
    checked.forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        if (crDeleteResults[idx]) idsToDelete.push(crDeleteResults[idx].promotionId);
    });
    deletePromotionRecordsByIds(idsToDelete);
    closeDeletePromotionModal();
    refreshCampaignRiskTracker();
}

// --- Scroll Sync ---
// Header/body horizontal scroll sync. Module-scoped refs so the listener can be rebound
// idempotently on each partial (re)mount and cleaned up on unmount (never stacked).
var _crScrollColEl = null;
var _crScrollHandler = null;

function initCrScrollSync() {
    // Was previously wired only on DOMContentLoaded — but this section is partial-loaded, so the
    // .scroll-col/.scroll-header nodes do not exist at DOMContentLoaded and the listener was never
    // attached (header stayed out of sync with the body). Bind on mount instead, idempotently.
    const root = document.getElementById('campaign-risk-section');
    if (!root) return;
    const scrollCol = root.querySelector('.cr-table .scroll-col');
    const scrollHeader = root.querySelector('.cr-table .scroll-header');
    if (!scrollCol || !scrollHeader) return;
    // Idempotent: drop any prior handler before re-binding so a re-mount never stacks listeners.
    if (_crScrollColEl && _crScrollHandler) {
        _crScrollColEl.removeEventListener('scroll', _crScrollHandler);
    }
    _crScrollColEl = scrollCol;
    _crScrollHandler = function() {
        scrollHeader.style.transform = 'translateX(-' + scrollCol.scrollLeft + 'px)';
    };
    scrollCol.addEventListener('scroll', _crScrollHandler);
    // Apply once so the header matches the body's current scrollLeft immediately (e.g. after a
    // resize/rerender that leaves the body scrolled).
    _crScrollHandler();
}

function _teardownCrScrollSync() {
    if (_crScrollColEl && _crScrollHandler) {
        _crScrollColEl.removeEventListener('scroll', _crScrollHandler);
    }
    _crScrollColEl = null;
    _crScrollHandler = null;
}

// --- Column resize (System Repair 2 Part E) ---
// Drag-to-resize the Promotion Risk Tracker scroll columns using the SHARED engine via the dual-layer
// adapter (KM.ui.dualLayerResize → KM.ui.resizableColumns) — NOT a page-specific drag implementation.
// The header cells are static in the partial, so this runs ONCE on mount; the filter / risk-card /
// pagination / scope re-renders only rewrite the body, so the handles + injected width rule persist
// (no duplicate handles). The adapter is idempotent + re-mount-safe (tears down any prior controller).
// The sticky SKU identity column stays fixed; only the scroll columns are resizable, and the table
// keeps its existing horizontal scroll wrapper (.scroll-col).
function _initCrColumnResize() {
    try {
        if (window.KM && window.KM.ui && window.KM.ui.dualLayerResize) {
            window.KM.ui.dualLayerResize.init({
                sectionId: 'campaign-risk-section',
                scrollHeaderSel: '#cr-table-scroll-header',
                scrollBodySel: '#cr-table-scroll-body',
                page: 'campaign-risk', group: 'promotion-risk'
            });
        }
    } catch (e) { console.warn('[CampaignRisk] column resize init failed:', e); }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    initCrScrollSync();
    // Selector population + initial (gated) render happen on lifecycle mount via crReload().
});

// --- Exports ---
window.renderCampaignRiskTracker = renderCampaignRiskTracker;
window.setCrCategory = setCrCategory;
window.setCrSeries = setCrSeries;
window.filterByRisk = filterByRisk;
window.crPrevPage = crPrevPage;
window.crNextPage = crNextPage;
window.crAddPromotion = crAddPromotion;
window.crDeletePromotions = crDeletePromotions;
window.openAddPromotionModal = openAddPromotionModal;
window.closeAddPromotionModal = closeAddPromotionModal;
window.openDeletePromotionModal = openDeletePromotionModal;
window.closeDeletePromotionModal = closeDeletePromotionModal;
window.setCrAddMode = setCrAddMode;
window.crOnAddSkuSelect = crOnAddSkuSelect;
window.crUpdateBatchSeries = crUpdateBatchSeries;
window.submitAddPromotion = submitAddPromotion;
window.crSearchDeleteRecords = crSearchDeleteRecords;
window.crSelectAllDelete = crSelectAllDelete;
window.crDeleteSelected = crDeleteSelected;
window.refreshCampaignRiskTracker = refreshCampaignRiskTracker;
window.crBuildGroups = crBuildGroups;
window.crPreviewAdd = crPreviewAdd;
// Site scope cascade + loader
window.populateCrSiteFilters = populateCrSiteFilters;
window.onCrCountryChange = onCrCountryChange;
window.onCrMarketplaceChange = onCrMarketplaceChange;
// Company filter removed (D) — company is derived from the selected marketplace_id, no separate control.
window.crReload = crReload;

// --- Lifecycle registration (Phase 2B-3) ---
// mount re-binds the document outside-click/ESC listeners (idempotent) and renders via the
// existing renderCampaignRiskTracker behavior; unmount removes those document listeners so
// repeated Home → Promotion Risk Tracker → Home cycles never stack listeners.
// Ensure the Campaign Risk markup is present before renderCampaignRiskTracker runs.
// Idempotent: if #campaign-risk-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureCampaignRiskMarkup() {
    if (document.getElementById('campaign-risk-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('campaign-risk', 'assets/html/pages/campaign-risk.html', '#campaign-risk-mount')
            .then(function() {
                if (!document.getElementById('campaign-risk-section')) {
                    console.warn('[CampaignRisk] partial loaded but #campaign-risk-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[CampaignRisk] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[CampaignRisk] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}

if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('campaign-risk-section', {
        mount() {
            console.log('[CampaignRisk] mount');
            // Markup is partial-loaded (Phase 3-10). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open) and run the existing
            // idempotent listener bind + render unchanged.
            _ensureCampaignRiskMarkup().then(function() {
                var sec = document.getElementById('campaign-risk-section');
                if (sec) sec.classList.add('active');
                _bindCrDocListeners();
                crReload();   // load cache (race-guarded) → populate Country selector → gated render
                _initCrColumnResize();   // static header present → wire drag-to-resize once (Part E)
                initCrScrollSync();      // bind header↔body horizontal scroll sync on mount (partial is now in the DOM)
            });
        },
        unmount() {
            console.log('[CampaignRisk] unmount');
            _unbindCrDocListeners();
            _teardownCrScrollSync();
        }
    });
}

// --- Debug / Test Helpers ---
function debugPromotionRecords() {
    console.log('=== Promotion Records ===');
    console.log('Count:', promotionMockData.length);
    console.table(promotionMockData.map(r => ({ id: r.promotionId, sku: r.sku, country: r.country, mp: r.marketplace, type: r.promotionType, event: r.eventFlag, start: r.startDate, end: r.endDate, promo: r.promoPrice, reg: r.regularPrice, lps: r.lps })));
}

function resetCampaignPromotionMockData() {
    localStorage.removeItem(LOCALSTORAGE_KEY);
    promotionMockData = [];   // overlay is empty by default (no mock seed); real promos come from campaigns
    refreshCampaignRiskTracker();
    console.log('Overlay promotions cleared. Records:', promotionMockData.length);
}
function _crDebugMid(sku) { var f = getSkuMasterData().find(function (s) { return s.sku === sku; }); return f ? f.marketplaceSkuId : ''; }

function addTestHighRiskPromotion() {
    const today = new Date();
    const records = [];
    for (let i = 0; i < 3; i++) {
        const start = new Date(today); start.setDate(start.getDate() + (i * 12));
        const end = new Date(start); end.setDate(end.getDate() + 10);
        records.push(normalizePromotionRecord({
            promotionId: 'test_high_' + Date.now() + '_' + i,
            campaignName: 'TEST-HighRisk-' + i,
            country: CampaignRiskState.country,
            marketplace: CampaignRiskState.marketplace,
            company: CampaignRiskState.company,
            sku: 'CO1100-R',
            marketplaceSkuId: _crDebugMid('CO1100-R'),
            promotionType: 'Price Discount',
            eventFlag: 'Normal',
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
            promoPrice: 19.99,
            regularPrice: 29.99,
            createdAt: new Date().toISOString(),
            updatedAt: ''
        }));
    }
    addPromotionRecords(records);
    refreshCampaignRiskTracker();
    console.log('Added 3 test promotions to push CO1100-R toward High Risk.');
}

function addTestAnnualEventPromotion() {
    const rec = normalizePromotionRecord({
        promotionId: 'test_annual_' + Date.now(),
        campaignName: 'TEST-PrimeDay',
        country: CampaignRiskState.country,
        marketplace: CampaignRiskState.marketplace,
        company: CampaignRiskState.company,
        sku: 'CO1100-R',
        marketplaceSkuId: _crDebugMid('CO1100-R'),
        promotionType: 'Lightning Deal',
        eventFlag: 'Prime Day',
        startDate: '2026-07-15',
        endDate: '2026-07-16',
        promoPrice: 14.99,
        regularPrice: 29.99,
        createdAt: new Date().toISOString(),
        updatedAt: ''
    });
    addPromotionRecords([rec]);
    refreshCampaignRiskTracker();
    console.log('Added Prime Day test record. Should appear in Annual Events, NOT Future Promo Days.');
}

window.debugPromotionRecords = debugPromotionRecords;
window.resetCampaignPromotionMockData = resetCampaignPromotionMockData;
window.addTestHighRiskPromotion = addTestHighRiskPromotion;
window.addTestAnnualEventPromotion = addTestAnnualEventPromotion;
window.addPromotionRecords = addPromotionRecords;
window.deletePromotionRecordsByIds = deletePromotionRecordsByIds;


// Debug helper
window.debugPromotionRiskFilters = function() {
    var categories = getCategories();
    var allSeries = getSeriesForCategory('all');
    console.log('=== Promotion Risk Filter Debug ===');
    console.log('Available categories:', categories);
    console.log('Selected categories:', CampaignRiskState.selectedCategories);
    console.log('Available series:', allSeries);
    console.log('Selected series:', CampaignRiskState.selectedSeries);
    console.log('Selected risk:', CampaignRiskState.selectedRisk);

    var catPanel = document.getElementById('cr-category-panel');
    var serPanel = document.getElementById('cr-series-panel');
    if (catPanel) {
        var catCbs = catPanel.querySelectorAll('input[type="checkbox"]:not([value=""])');
        console.log('Category checkboxes:', Array.from(catCbs).map(function(cb) { return { value: cb.value, checked: cb.checked }; }));
    }
    if (serPanel) {
        var serCbs = serPanel.querySelectorAll('input[type="checkbox"]:not([value=""])');
        console.log('Series checkboxes:', Array.from(serCbs).map(function(cb) { return { value: cb.value, checked: cb.checked }; }));
    }

    var results = getFilteredRiskResults();
    console.log('Filtered result count:', results.length);
};
