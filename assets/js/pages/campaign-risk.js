// ========================================
// Campaign Risk Tracker (Promotion Risk)
// ========================================

// --- State ---
const CampaignRiskState = {
    country: 'US',
    marketplaces: ['Amazon'],
    selectedCategories: [],  // empty = all
    selectedSeries: [],      // empty = all
    selectedRisk: 'all',
    page: 1,
    pageSize: 25
};

// --- Country / Marketplace Mapping ---
const countryMarketplaceMap = {
    'US': ['Amazon', 'KM Walmart', 'RU Walmart', 'Target', 'Wayfair', 'Shopify', 'Newegg'],
    'CA': ['Amazon', 'Shopify'],
    'DE': ['Amazon', 'Shopify'],
    'FR': ['Amazon', 'Shopify'],
    'UK': ['Amazon', 'Shopify'],
    'AU': ['Amazon', 'Shopify'],
    'ES': ['Amazon'],
    'NL': ['Amazon'],
    'SG': ['Amazon'],
    'JP': ['Amazon']
};

// --- Inventory SKU Availability Mock ---
const inventorySkuAvailabilityMock = [
    { country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' },
    { country: 'US', marketplace: 'Amazon', sku: 'CO1100-S' },
    { country: 'US', marketplace: 'Amazon', sku: 'CO1150-R' },
    { country: 'US', marketplace: 'Amazon', sku: 'CO1150-AG' },
    { country: 'US', marketplace: 'Amazon', sku: 'SP3120-R' },
    { country: 'US', marketplace: 'Target', sku: 'CO1100-R' },
    { country: 'US', marketplace: 'Target', sku: 'CO1150-R' },
    { country: 'US', marketplace: 'Target', sku: 'MO5600-R' },
    { country: 'US', marketplace: 'Shopify', sku: 'CO1100-W' },
    { country: 'US', marketplace: 'Shopify', sku: 'SP3410-R' },
    { country: 'US', marketplace: 'Shopify', sku: 'MO5600-W' },
    { country: 'US', marketplace: 'KM Walmart', sku: 'CO1100-R' },
    { country: 'US', marketplace: 'KM Walmart', sku: 'CO1150-R' },
    { country: 'US', marketplace: 'KM Walmart', sku: 'SP3120-M' },
    { country: 'US', marketplace: 'KM Walmart', sku: 'MO5600-R' },
    { country: 'CA', marketplace: 'Amazon', sku: 'CO1100-R' },
    { country: 'CA', marketplace: 'Amazon', sku: 'CO1150-N' },
    { country: 'CA', marketplace: 'Amazon', sku: 'SP3120-T' },
    { country: 'CA', marketplace: 'Amazon', sku: 'MO5600-M' },
    { country: 'UK', marketplace: 'Amazon', sku: 'CO1100-T' },
    { country: 'UK', marketplace: 'Amazon', sku: 'CO1150-MB' },
    { country: 'UK', marketplace: 'Amazon', sku: 'SP3410-B' },
    { country: 'UK', marketplace: 'Amazon', sku: 'MO5600-T' },
    { country: 'DE', marketplace: 'Amazon', sku: 'CO1100-R' },
    { country: 'DE', marketplace: 'Amazon', sku: 'CO1150-R' },
    { country: 'DE', marketplace: 'Amazon', sku: 'SP3120-B' },
    { country: 'FR', marketplace: 'Amazon', sku: 'CO1100-S' },
    { country: 'FR', marketplace: 'Amazon', sku: 'CO1150-AG' },
    { country: 'FR', marketplace: 'Amazon', sku: 'MO5600-R' },
    { country: 'AU', marketplace: 'Amazon', sku: 'CO1100-R' },
    { country: 'AU', marketplace: 'Amazon', sku: 'SP3120-Y' },
    { country: 'AU', marketplace: 'Amazon', sku: 'MO5600-B' },
    { country: 'JP', marketplace: 'Amazon', sku: 'CO1100-T' },
    { country: 'JP', marketplace: 'Amazon', sku: 'SP3120-R' },
    { country: 'JP', marketplace: 'Amazon', sku: 'SP3410-T' },
    { country: 'ES', marketplace: 'Amazon', sku: 'CO1100-R' },
    { country: 'ES', marketplace: 'Amazon', sku: 'CO1150-R' },
    { country: 'ES', marketplace: 'Amazon', sku: 'MO5600-R' },
    { country: 'NL', marketplace: 'Amazon', sku: 'CO1100-S' },
    { country: 'NL', marketplace: 'Amazon', sku: 'SP3120-M' },
    { country: 'NL', marketplace: 'Amazon', sku: 'MO5600-M' },
    { country: 'SG', marketplace: 'Amazon', sku: 'CO1100-R' },
    { country: 'SG', marketplace: 'Amazon', sku: 'CO1150-R' },
    { country: 'SG', marketplace: 'Amazon', sku: 'SP3410-R' },
    { country: 'CA', marketplace: 'Shopify', sku: 'CO1100-R' },
    { country: 'CA', marketplace: 'Shopify', sku: 'SP3120-R' },
    { country: 'CA', marketplace: 'Shopify', sku: 'MO5600-R' },
    { country: 'UK', marketplace: 'Shopify', sku: 'CO1100-R' },
    { country: 'UK', marketplace: 'Shopify', sku: 'SP3410-T' },
    { country: 'UK', marketplace: 'Shopify', sku: 'MO5600-W' },
    { country: 'DE', marketplace: 'Shopify', sku: 'CO1150-MB' },
    { country: 'DE', marketplace: 'Shopify', sku: 'SP3120-T' },
    { country: 'DE', marketplace: 'Shopify', sku: 'MO5600-T' },
];

// --- Promotion Mock Data ---
const LOCALSTORAGE_KEY = 'km_campaign_promotion_records_v2';

const defaultPromotionMockData = [
    { promotionId: 'promo_001', campaignName: 'CO1100-R-PD-20260210', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-02-10', endDate: '2026-02-20', promoPrice: 19.99, regularPrice: 29.99 },
    { promotionId: 'promo_002', campaignName: 'CO1100-R-CP-20260301', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', promotionType: 'Coupon', eventFlag: 'Normal', startDate: '2026-03-01', endDate: '2026-03-14', promoPrice: 21.99, regularPrice: 29.99 },
    { promotionId: 'promo_003', campaignName: 'CO1100-R-PD-20260320', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-03-20', endDate: '2026-04-05', promoPrice: 22.99, regularPrice: 29.99 },
    { promotionId: 'promo_004', campaignName: 'CO1100-R-PD-20260415', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-04-15', endDate: '2026-04-25', promoPrice: 20.99, regularPrice: 29.99 },
    { promotionId: 'promo_005', campaignName: 'CO1100-S-CP-20260215', country: 'US', marketplace: 'Amazon', sku: 'CO1100-S', promotionType: 'Coupon', eventFlag: 'Normal', startDate: '2026-02-15', endDate: '2026-02-25', promoPrice: 21.99, regularPrice: 29.99 },
    { promotionId: 'promo_006', campaignName: 'CO1100-S-PD-20260420', country: 'US', marketplace: 'Amazon', sku: 'CO1100-S', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-04-20', endDate: '2026-05-10', promoPrice: 22.99, regularPrice: 29.99 },
    { promotionId: 'promo_007', campaignName: 'CO1150-R-LD-PrimeDay', country: 'US', marketplace: 'Amazon', sku: 'CO1150-R', promotionType: 'Lightning Deal', eventFlag: 'Prime Day', startDate: '2026-07-15', endDate: '2026-07-16', promoPrice: 22.99, regularPrice: 34.99 },
    { promotionId: 'promo_008', campaignName: 'CO1150-R-PD-20260305', country: 'US', marketplace: 'Amazon', sku: 'CO1150-R', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-03-05', endDate: '2026-03-12', promoPrice: 26.99, regularPrice: 34.99 },
    { promotionId: 'promo_009', campaignName: 'CO1150-AG-BD-BFCM', country: 'US', marketplace: 'Amazon', sku: 'CO1150-AG', promotionType: 'Best Deal', eventFlag: 'BFCM', startDate: '2026-11-27', endDate: '2026-12-02', promoPrice: 19.99, regularPrice: 34.99 },
    { promotionId: 'promo_010', campaignName: 'CO1150-AG-CP-20260120', country: 'US', marketplace: 'Amazon', sku: 'CO1150-AG', promotionType: 'Coupon', eventFlag: 'Normal', startDate: '2026-01-20', endDate: '2026-02-15', promoPrice: 27.99, regularPrice: 34.99 },
    { promotionId: 'promo_011', campaignName: 'CO1150-AG-PD-20260220', country: 'US', marketplace: 'Amazon', sku: 'CO1150-AG', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-02-20', endDate: '2026-03-10', promoPrice: 26.99, regularPrice: 34.99 },
    { promotionId: 'promo_012', campaignName: 'CO1150-AG-PD-20260315', country: 'US', marketplace: 'Amazon', sku: 'CO1150-AG', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-03-15', endDate: '2026-04-01', promoPrice: 27.99, regularPrice: 34.99 },
    { promotionId: 'promo_013', campaignName: 'CO1150-AG-CP-20260410', country: 'US', marketplace: 'Amazon', sku: 'CO1150-AG', promotionType: 'Coupon', eventFlag: 'Normal', startDate: '2026-04-10', endDate: '2026-04-30', promoPrice: 28.99, regularPrice: 34.99 },
    { promotionId: 'promo_014', campaignName: 'SP3120-R-PD-20260301', country: 'US', marketplace: 'Amazon', sku: 'SP3120-R', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-03-01', endDate: '2026-03-07', promoPrice: 9.99, regularPrice: 14.99 },
    { promotionId: 'promo_015', campaignName: 'SP3120-R-LD-FallPrime', country: 'US', marketplace: 'Amazon', sku: 'SP3120-R', promotionType: 'Lightning Deal', eventFlag: 'Fall Prime', startDate: '2026-10-08', endDate: '2026-10-09', promoPrice: 8.99, regularPrice: 14.99 },
    { promotionId: 'promo_016', campaignName: 'MO5600-R-CP-20260201', country: 'US', marketplace: 'Target', sku: 'MO5600-R', promotionType: 'Coupon', eventFlag: 'Normal', startDate: '2026-02-01', endDate: '2026-02-07', promoPrice: 13.99, regularPrice: 19.99 },
    { promotionId: 'promo_017', campaignName: 'CO1100-R-PD-CA', country: 'CA', marketplace: 'Amazon', sku: 'CO1100-R', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-03-10', endDate: '2026-03-20', promoPrice: 19.99, regularPrice: 29.99 },
    { promotionId: 'promo_018', campaignName: 'CO1100-T-PD-UK', country: 'UK', marketplace: 'Amazon', sku: 'CO1100-T', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-03-01', endDate: '2026-03-10', promoPrice: 17.99, regularPrice: 24.99 },
    { promotionId: 'promo_019', campaignName: 'CO1100-R-CP-DE', country: 'DE', marketplace: 'Amazon', sku: 'CO1100-R', promotionType: 'Coupon', eventFlag: 'Normal', startDate: '2026-02-20', endDate: '2026-03-05', promoPrice: 18.99, regularPrice: 26.99 },
    { promotionId: 'promo_020', campaignName: 'CO1150-R-LD-PrimeDay2', country: 'US', marketplace: 'Amazon', sku: 'CO1150-R', promotionType: 'Lightning Deal', eventFlag: 'Prime Day', startDate: '2026-07-15', endDate: '2026-07-16', promoPrice: 24.99, regularPrice: 34.99 },
    { promotionId: 'promo_021', campaignName: 'CO1100-R-PD-Heavy01', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R', promotionType: 'Price Discount', eventFlag: 'Normal', startDate: '2026-01-15', endDate: '2026-02-05', promoPrice: 19.99, regularPrice: 29.99 },
];

// --- localStorage Persistence ---
function normalizePromotionRecord(rec) {
    const duration = rec.duration || (rec.startDate && rec.endDate ? calculatePromotionDuration(rec.startDate, rec.endDate) : 0);
    const discountPercent = rec.discountPercent || (rec.regularPrice > 0 ? Math.round((1 - rec.promoPrice / rec.regularPrice) * 1000) / 10 : 0);
    return { ...rec, duration, discountPercent, lps: rec.lps || false, specialCondition: rec.specialCondition || '', createdAt: rec.createdAt || new Date().toISOString(), updatedAt: rec.updatedAt || '' };
}

function loadPromotionRecords() {
    try {
        const stored = localStorage.getItem(LOCALSTORAGE_KEY);
        if (stored) return JSON.parse(stored).map(normalizePromotionRecord);
    } catch(e) { console.warn('Failed to load localStorage promotion records:', e); }
    return defaultPromotionMockData.map(normalizePromotionRecord);
}

function savePromotionRecords() {
    try { localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(promotionMockData)); } catch(e) { console.warn('Failed to save:', e); }
}

let promotionMockData = loadPromotionRecords();

// --- SKU Master Mapping ---
function getAllSkuDetails() {
    return [...(window.upcomingSkuData || []), ...(window.runningSkuData || []), ...(window.phasingOutSkuData || [])];
}

function getEligibleSkusByCountryMarketplace(country, marketplaces) {
    return [...new Set(
        inventorySkuAvailabilityMock
            .filter(r => r.country === country && marketplaces.includes(r.marketplace))
            .map(r => r.sku)
    )];
}

function enrichEligibleSkusWithSkuDetails(eligibleSkuCodes) {
    const allDetails = getAllSkuDetails();
    return eligibleSkuCodes.map(sku => {
        const detail = allDetails.find(d => d.sku === sku);
        return {
            sku,
            productName: detail?.productName || 'Unknown Product',
            category: detail?.category || 'Unknown',
            series: detail?.series || 'Unknown',
            image: detail?.image || ''
        };
    });
}

function getSkuMasterData() {
    // Only show data when Demo mode is ON
    if (!(window.KM && window.KM.DemoData && window.KM.DemoData.isEnabled && window.KM.DemoData.isEnabled())) {
        return [];
    }
    const eligibleCodes = getEligibleSkusByCountryMarketplace(CampaignRiskState.country, CampaignRiskState.marketplaces);
    return enrichEligibleSkusWithSkuDetails(eligibleCodes);
}

// --- Risk Calculation ---
function daysBetweenInclusive(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    return Math.max(0, Math.floor((e - s) / 86400000) + 1);
}

const ANNUAL_EVENTS = ['Prime Day', 'BFCM', 'Fall Prime'];

function calculateSkuRisk(sku, country, marketplaces) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 90);

    const promos = promotionMockData.filter(p => p.sku === sku && p.country === country && marketplaces.includes(p.marketplace));

    let ninetyDayDays = 0;
    let futureDays = 0;
    let annualEventDays = 0;
    let totalPromos = promos.length;

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
    const results = getFilteredRiskResults();
    let safe = 0, watch = 0, high = 0;
    results.forEach(r => {
        if (r.riskLevel === 'Safe') safe++;
        else if (r.riskLevel === 'Watch') watch++;
        else high++;
    });

    const container = document.getElementById('cr-kpi-cards');
    if (!container) return;
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

function renderRiskFilters() {
    var categories = getCategories();
    var allSeries = getSeriesForCategory('all');

    var catPanel = document.getElementById('cr-category-panel');
    var serPanel = document.getElementById('cr-series-panel');
    if (!catPanel || !serPanel) return;

    catPanel.innerHTML = '<label class="cr-checkbox-item"><input type="checkbox" value="" checked> <strong>All</strong></label>' +
        categories.map(function(c) { return '<label class="cr-checkbox-item"><input type="checkbox" value="' + c + '" checked> ' + c + '</label>'; }).join('');

    serPanel.innerHTML = '<label class="cr-checkbox-item"><input type="checkbox" value="" checked> <strong>All</strong></label>' +
        allSeries.map(function(s) { return '<label class="cr-checkbox-item"><input type="checkbox" value="' + s + '" checked> ' + s + '</label>'; }).join('');

    _initCrDropdowns();
}

function _initCrDropdowns() {
    var root = document.getElementById('campaign-risk-section');
    if (!root) return;

    root.querySelectorAll('.cr-dropdown-trigger').forEach(function(trigger) {
        trigger.onclick = function(e) {
            e.stopPropagation();
            var filterType = this.dataset.filter;
            var panel = root.querySelector('.cr-dropdown-panel[data-filter="' + filterType + '"]');
            root.querySelectorAll('.cr-dropdown-panel').forEach(function(p) {
                if (p !== panel) p.classList.remove('is-open');
            });
            root.querySelectorAll('.cr-dropdown-trigger').forEach(function(t) { t.setAttribute('aria-expanded', 'false'); });
            if (panel) {
                panel.classList.toggle('is-open');
                this.setAttribute('aria-expanded', panel.classList.contains('is-open') ? 'true' : 'false');
            }
        };
    });

    root.querySelectorAll('.cr-dropdown-panel').forEach(function(panel) {
        panel.onclick = function(e) { e.stopPropagation(); };
        var filterType = panel.dataset.filter;
        var allCb = panel.querySelector('input[value=""]');
        var otherCbs = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');

        if (allCb) {
            allCb.onchange = function() {
                otherCbs.forEach(function(cb) { cb.checked = allCb.checked; });
                _syncCrFilterState(filterType, panel);
            };
        }
        otherCbs.forEach(function(cb) {
            cb.onchange = function() {
                var checkedCount = Array.from(otherCbs).filter(function(c) { return c.checked; }).length;
                if (allCb) allCb.checked = (checkedCount === otherCbs.length);
                _syncCrFilterState(filterType, panel);
            };
        });
    });

    document.addEventListener('click', function(e) {
        if (!root.contains(e.target)) {
            root.querySelectorAll('.cr-dropdown-panel').forEach(function(p) { p.classList.remove('is-open'); });
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            root.querySelectorAll('.cr-dropdown-panel').forEach(function(p) { p.classList.remove('is-open'); });
        }
    });
}

function _syncCrFilterState(filterType, panel) {
    var allCb = panel.querySelector('input[value=""]');
    var otherCbs = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
    var selected = Array.from(otherCbs).filter(function(c) { return c.checked; }).map(function(c) { return c.value; });
    if (allCb && allCb.checked) selected = [];
    if (selected.length === otherCbs.length) selected = [];

    if (filterType === 'category') CampaignRiskState.selectedCategories = selected;
    else if (filterType === 'series') CampaignRiskState.selectedSeries = selected;

    _updateCrDropdownText(filterType);
    CampaignRiskState.page = 1;
    renderCampaignRiskTracker();
}

function _updateCrDropdownText(filterType) {
    var root = document.getElementById('campaign-risk-section');
    if (!root) return;
    var trigger = root.querySelector('.cr-dropdown-trigger[data-filter="' + filterType + '"]');
    var panel = root.querySelector('.cr-dropdown-panel[data-filter="' + filterType + '"]');
    if (!trigger || !panel) return;
    var textSpan = trigger.querySelector('.cr-dropdown-text');
    var allCb = panel.querySelector('input[value=""]');
    var otherCbs = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
    var checked = Array.from(otherCbs).filter(function(c) { return c.checked; });

    var labels = { category: 'Categories', series: 'Series' };
    var label = labels[filterType] || filterType;

    if ((allCb && allCb.checked) || checked.length === 0 || checked.length === otherCbs.length) {
        textSpan.textContent = 'All ' + label;
    } else if (checked.length === 1) {
        textSpan.textContent = checked[0].value;
    } else {
        textSpan.textContent = checked.length + ' ' + label;
    }
}

function getFilteredRiskResults() {
    let skus = getSkuMasterData();
    if (CampaignRiskState.selectedCategories.length > 0) {
        skus = skus.filter(s => CampaignRiskState.selectedCategories.includes(s.category));
    }
    if (CampaignRiskState.selectedSeries.length > 0) {
        skus = skus.filter(s => CampaignRiskState.selectedSeries.includes(s.series));
    }
    return skus.map(s => ({ ...s, ...calculateSkuRisk(s.sku, CampaignRiskState.country, CampaignRiskState.marketplaces) }));
}

function renderRiskTable() {
    let results = getFilteredRiskResults();
    if (CampaignRiskState.selectedRisk !== 'all') {
        results = results.filter(r => r.riskLevel === CampaignRiskState.selectedRisk);
    }

    const total = results.length;
    const totalPages = Math.ceil(total / CampaignRiskState.pageSize);
    if (CampaignRiskState.page > totalPages) CampaignRiskState.page = 1;
    const start = (CampaignRiskState.page - 1) * CampaignRiskState.pageSize;
    const pageData = results.slice(start, start + CampaignRiskState.pageSize);

    const fixedBody = document.getElementById('cr-table-fixed-body');
    const scrollBody = document.getElementById('cr-table-scroll-body');
    const pagination = document.getElementById('cr-pagination');
    if (!fixedBody || !scrollBody) return;

    if (total === 0) {
        fixedBody.innerHTML = '';
        scrollBody.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;">No SKUs found for the selected filters.</div>';
        if (pagination) pagination.innerHTML = '';
        return;
    }

    fixedBody.innerHTML = pageData.map(r => `
        <div class="fixed-row">${r.sku}</div>
    `).join('');

    scrollBody.innerHTML = pageData.map(r => {
        const riskClass = r.riskLevel === 'Safe' ? 'cr-risk--safe' : r.riskLevel === 'Watch' ? 'cr-risk--watch' : 'cr-risk--high';
        return `
        <div class="scroll-row">
            <div class="scroll-cell cr-cell--img"><div class="cr-img-placeholder">IMG</div></div>
            <div class="scroll-cell cr-cell--name">${r.productName}</div>
            <div class="scroll-cell">${r.ninetyDayDays}</div>
            <div class="scroll-cell">${r.futureDays}</div>
            <div class="scroll-cell">${r.annualEventDays || 0}</div>
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

// --- Interaction Handlers ---
function setCrCountry(country) {
    CampaignRiskState.country = country;
    CampaignRiskState.marketplaces = [countryMarketplaceMap[country]?.[0] || 'Amazon'];
    CampaignRiskState.selectedCategories = [];
    CampaignRiskState.selectedSeries = [];
    CampaignRiskState.selectedRisk = 'all';
    CampaignRiskState.page = 1;
    updateCrFilterButton();
    renderCampaignRiskTracker();
}

function updateCrFilterButton() {
    const btn = document.getElementById('cr-country-filter-btn');
    if (btn) {
        btn.textContent = `${CampaignRiskState.country} \u2022 ${CampaignRiskState.marketplaces.length} marketplace`;
    }
}

function openCrCountryMarketplaceModal() {
    let modal = document.getElementById('cr-cm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cr-cm-modal';
        modal.className = 'cr-modal-overlay';
        document.body.appendChild(modal);
    }
    const countries = Object.keys(countryMarketplaceMap);
    const currentCountry = CampaignRiskState.country;
    const currentMPs = CampaignRiskState.marketplaces;
    const mpOptions = countryMarketplaceMap[currentCountry] || [];

    modal.innerHTML = `
        <div class="cr-modal">
            <div class="cr-modal-header"><h3>Filter by Country & Marketplace</h3><button class="cr-modal-close" onclick="closeCrCmModal()">&times;</button></div>
            <div class="cr-modal-body">
                <div class="cr-filter-group"><div class="cr-filter-group-label">Country</div>
                    <div class="cr-chips" id="cr-cm-countries">${countries.map(c => `<button class="cr-chip ${c === currentCountry ? 'is-active' : ''}" onclick="crCmSelectCountry('${c}')">${c}</button>`).join('')}</div>
                </div>
                <div class="cr-filter-group" style="margin-top:16px;"><div class="cr-filter-group-label">Marketplace</div>
                    <div class="cr-chips" id="cr-cm-marketplaces">${mpOptions.map(m => `<button class="cr-chip ${currentMPs.includes(m) ? 'is-active' : ''}" onclick="crCmToggleMarketplace('${m}')">${m}</button>`).join('')}</div>
                </div>
            </div>
            <div class="cr-modal-footer">
                <button class="cr-btn cr-btn--cancel" onclick="closeCrCmModal()">Cancel</button>
                <button class="cr-btn cr-btn--primary" onclick="applyCrCmFilter()">Apply Filters</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
    window._crCmTempCountry = currentCountry;
    window._crCmTempMPs = [...currentMPs];
}

function closeCrCmModal() {
    const modal = document.getElementById('cr-cm-modal');
    if (modal) modal.style.display = 'none';
}

function crCmSelectCountry(country) {
    window._crCmTempCountry = country;
    window._crCmTempMPs = [countryMarketplaceMap[country]?.[0] || 'Amazon'];
    // Re-render chips
    const countries = Object.keys(countryMarketplaceMap);
    const mpOptions = countryMarketplaceMap[country] || [];
    document.getElementById('cr-cm-countries').innerHTML = countries.map(c => `<button class="cr-chip ${c === country ? 'is-active' : ''}" onclick="crCmSelectCountry('${c}')">${c}</button>`).join('');
    document.getElementById('cr-cm-marketplaces').innerHTML = mpOptions.map(m => `<button class="cr-chip ${window._crCmTempMPs.includes(m) ? 'is-active' : ''}" onclick="crCmToggleMarketplace('${m}')">${m}</button>`).join('');
}

function crCmToggleMarketplace(mp) {
    const idx = window._crCmTempMPs.indexOf(mp);
    if (idx >= 0) {
        if (window._crCmTempMPs.length > 1) window._crCmTempMPs.splice(idx, 1);
    } else {
        window._crCmTempMPs.push(mp);
    }
    const mpOptions = countryMarketplaceMap[window._crCmTempCountry] || [];
    document.getElementById('cr-cm-marketplaces').innerHTML = mpOptions.map(m => `<button class="cr-chip ${window._crCmTempMPs.includes(m) ? 'is-active' : ''}" onclick="crCmToggleMarketplace('${m}')">${m}</button>`).join('');
}

function applyCrCmFilter() {
    CampaignRiskState.country = window._crCmTempCountry;
    CampaignRiskState.marketplaces = [...window._crCmTempMPs];
    CampaignRiskState.selectedCategories = [];
    CampaignRiskState.selectedSeries = [];
    CampaignRiskState.selectedRisk = 'all';
    CampaignRiskState.page = 1;
    closeCrCmModal();
    updateCrFilterButton();
    renderCampaignRiskTracker();
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
    openAddPromotionModal();
}
function crDeletePromotions() {
    openDeletePromotionModal();
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

function detectDuplicatePromotion(rec) {
    return promotionMockData.some(p =>
        p.country === rec.country && p.marketplace === rec.marketplace && p.sku === rec.sku &&
        p.startDate === rec.startDate && p.endDate === rec.endDate && p.promotionType === rec.promotionType
    );
}

function detectOverlappingPromotions(rec) {
    return promotionMockData.filter(p =>
        p.sku === rec.sku && p.country === rec.country && p.marketplace === rec.marketplace &&
        rec.startDate <= p.endDate && rec.endDate >= p.startDate &&
        !(p.startDate === rec.startDate && p.endDate === rec.endDate && p.promotionType === rec.promotionType)
    );
}

function calculateSkuRiskAfterAdd(sku, newRecords) {
    const current = calculateSkuRisk(sku, CampaignRiskState.country, CampaignRiskState.marketplaces);
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
    let skus = getSkuMasterData();
    if (category !== 'all') skus = skus.filter(s => s.category === category);
    if (series !== 'all') skus = skus.filter(s => s.series === series);
    const allDetails = getAllSkuDetails();
    const groups = {};
    skus.forEach(s => {
        const detail = allDetails.find(d => d.sku === s.sku);
        const regPrice = parseFloat(detail?.sellingPrice?.replace('$','') || detail?.msrp?.replace('$','') || '29.99');
        const key = `${s.series}__${regPrice.toFixed(2)}`;
        if (!groups[key]) groups[key] = { series: s.series, category: s.category, regularPrice: regPrice, skus: [] };
        groups[key].skus.push({ sku: s.sku, productName: s.productName });
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
                    <div class="cr-form-row">
                        <div class="cr-form-group"><label>Country</label><select id="cr-add-country"><option value="US">US</option><option value="CA">CA</option><option value="UK">UK</option><option value="DE">DE</option><option value="AU">AU</option><option value="JP">JP</option></select></div>
                        <div class="cr-form-group"><label>Marketplace</label><select id="cr-add-marketplace"><option value="Amazon">Amazon</option><option value="Shopify">Shopify</option><option value="Target">Target</option><option value="Walmart">Walmart</option><option value="Wayfair">Wayfair</option></select></div>
                    </div>
                    <div class="cr-form-row"><div class="cr-form-group cr-form-group--full"><label>Mode</label><div class="cr-mode-toggle"><button class="cr-mode-btn is-active" onclick="setCrAddMode('single')">Single SKU</button><button class="cr-mode-btn" onclick="setCrAddMode('batch')">Category / Series Batch</button></div></div></div>
                </div>
                <div class="cr-add-section"><div class="cr-add-section-title">2. Target</div>
                    <div id="cr-add-single-fields"><div class="cr-form-row"><div class="cr-form-group cr-form-group--full"><label>SKU *</label><input type="text" id="cr-add-sku" placeholder="Enter SKU..." oninput="crLookupSku()"><div id="cr-add-sku-status" class="cr-sku-status"></div></div></div></div>
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

function crLookupSku() {
    const val = document.getElementById('cr-add-sku').value.trim();
    const status = document.getElementById('cr-add-sku-status');
    if (!val) { status.innerHTML = ''; return; }
    const allDetails = getAllSkuDetails();
    const found = allDetails.find(d => d.sku === val);
    if (found) {
        const eligible = getEligibleSkusByCountryMarketplace(CampaignRiskState.country, CampaignRiskState.marketplaces);
        if (eligible.includes(val)) status.innerHTML = `<span class="cr-sku-found">SKU found: ${found.productName}</span>`;
        else status.innerHTML = `<span class="cr-sku-warning">This SKU exists in SKU Details but is not available in the selected country / marketplace.</span>`;
    } else { status.innerHTML = `<span class="cr-sku-notfound">SKU not found in SKU Details</span>`; }
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
        const sku = document.getElementById('cr-add-sku').value.trim();
        if(!sku){errEl.textContent='SKU is required.';return;}
        const found = getAllSkuDetails().find(d=>d.sku===sku);
        if(!found){errEl.textContent='SKU not found in SKU Details.';return;}
        const reg = parseFloat(document.getElementById('cr-add-regular').value);
        const promo = parseFloat(document.getElementById('cr-add-promo').value);
        if(isNaN(reg)||reg<0){errEl.textContent='Regular Price must be a valid number.';return;}
        if(isNaN(promo)||promo<0){errEl.textContent='Promo Price must be a valid number.';return;}
        if(promo>reg){errEl.textContent='Promo Price cannot be greater than Regular Price.';return;}
        records.push({sku,regularPrice:reg,promoPrice:promo,productName:found.productName,series:found.series||''});
    } else {
        if(crPriceGroups.length===0){errEl.textContent='No eligible SKUs found.';return;}
        const inputs = document.querySelectorAll('.cr-pg-promo-input');
        for(let i=0;i<crPriceGroups.length;i++){
            const promo = parseFloat(inputs[i]?.value);
            if(isNaN(promo)||promo<0){errEl.textContent=`Promo Price for group ${crPriceGroups[i].series} is invalid.`;return;}
            if(promo>crPriceGroups[i].regularPrice){errEl.textContent=`Promo Price for ${crPriceGroups[i].series} cannot exceed Regular Price.`;return;}
            crPriceGroups[i].skus.forEach(s=>{
                records.push({sku:s.sku,regularPrice:crPriceGroups[i].regularPrice,promoPrice:promo,productName:s.productName,series:crPriceGroups[i].series});
            });
        }
    }

    const warnings = [...(dateCheck.warnings||[])];
    const previewRows = [];
    let hasDuplicate = false;
    records.forEach(r=>{
        const rec = {country,marketplace,sku:r.sku,startDate,endDate,promotionType:type==='PED'?'Prime Exclusive Discount':type,eventFlag};
        if(detectDuplicatePromotion(rec)){hasDuplicate=true;return;}
        const overlaps = detectOverlappingPromotions(rec);
        if(overlaps.length>0) warnings.push(`${r.sku}: overlaps with existing promotion.`);
        const riskAfter = calculateSkuRiskAfterAdd(r.sku,[{...rec,promoPrice:r.promoPrice,regularPrice:r.regularPrice}]);
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
            country, marketplace, sku: r.sku,
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
                <div class="cr-form-row">
                    <div class="cr-form-group"><label>Country</label><select id="cr-del-country"><option value="">All</option><option value="US">US</option><option value="CA">CA</option><option value="UK">UK</option><option value="DE">DE</option><option value="AU">AU</option><option value="JP">JP</option></select></div>
                    <div class="cr-form-group"><label>Marketplace</label><select id="cr-del-marketplace"><option value="">All</option><option value="Amazon">Amazon</option><option value="Shopify">Shopify</option><option value="Target">Target</option><option value="Walmart">Walmart</option></select></div>
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

    crDeleteResults = promotionMockData.filter(p => {
        if (country && p.country !== country) return false;
        if (marketplace && p.marketplace !== marketplace) return false;
        if (sku && !p.sku.toLowerCase().includes(sku.toLowerCase())) return false;
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
function initCrScrollSync() {
    const scrollCol = document.querySelector('#campaign-risk-section .cr-table .scroll-col');
    const scrollHeader = document.querySelector('#campaign-risk-section .cr-table .scroll-header');
    if (!scrollCol || !scrollHeader) return;
    scrollCol.addEventListener('scroll', function() {
        scrollHeader.style.transform = 'translateX(-' + this.scrollLeft + 'px)';
    });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    initCrScrollSync();
    updateCrFilterButton();
    renderRiskFilters();
});

// --- Exports ---
window.renderCampaignRiskTracker = renderCampaignRiskTracker;
window.setCrCountry = setCrCountry;
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
window.crLookupSku = crLookupSku;
window.crUpdateBatchSeries = crUpdateBatchSeries;
window.submitAddPromotion = submitAddPromotion;
window.crSearchDeleteRecords = crSearchDeleteRecords;
window.crSelectAllDelete = crSelectAllDelete;
window.crDeleteSelected = crDeleteSelected;
window.refreshCampaignRiskTracker = refreshCampaignRiskTracker;
window.openCrCountryMarketplaceModal = openCrCountryMarketplaceModal;
window.closeCrCmModal = closeCrCmModal;
window.crCmSelectCountry = crCmSelectCountry;
window.crCmToggleMarketplace = crCmToggleMarketplace;
window.applyCrCmFilter = applyCrCmFilter;
window.updateCrFilterButton = updateCrFilterButton;


window.crBuildGroups = crBuildGroups;
window.crPreviewAdd = crPreviewAdd;

// --- Debug / Test Helpers ---
function debugPromotionRecords() {
    console.log('=== Promotion Records ===');
    console.log('Count:', promotionMockData.length);
    console.table(promotionMockData.map(r => ({ id: r.promotionId, sku: r.sku, country: r.country, mp: r.marketplace, type: r.promotionType, event: r.eventFlag, start: r.startDate, end: r.endDate, promo: r.promoPrice, reg: r.regularPrice, lps: r.lps })));
}

function resetCampaignPromotionMockData() {
    localStorage.removeItem(LOCALSTORAGE_KEY);
    promotionMockData = defaultPromotionMockData.map(normalizePromotionRecord);
    refreshCampaignRiskTracker();
    console.log('Mock data reset to defaults. Records:', promotionMockData.length);
}

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
            marketplace: CampaignRiskState.marketplaces[0] || 'Amazon',
            sku: 'CO1100-R',
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
        marketplace: CampaignRiskState.marketplaces[0] || 'Amazon',
        sku: 'CO1100-R',
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
