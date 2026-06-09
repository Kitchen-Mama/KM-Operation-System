// ========================================
// Operation System DB API Adapter
// Google Sheet read-only integration
// ========================================

const OP_DB_API_BASE_URL = 'https://script.google.com/macros/s/AKfycbzQSU0ZR4EW5F79EzpOoBvUDxjJNLZkLrPkFjuaCBwiWXZMBPR4jnxvIS0FZnjNnp9Q/exec';

// ========================================
// Configuration Check
// ========================================

function isOperationDbApiConfigured() {
    return OP_DB_API_BASE_URL &&
        OP_DB_API_BASE_URL !== 'PASTE_WEB_APP_EXEC_URL_HERE' &&
        OP_DB_API_BASE_URL.startsWith('https://script.google.com/');
}

function getOperationDbDataSourceMode() {
    if (!window._opDbCache) return 'not-loaded';
    return window._opDbCache._sourceMode || 'mock';
}

var OperationDbState = {
    data: null,
    dataSourceMode: 'not-loaded',
    lastLoadedAt: null,
    lastFetchUrl: '',
    lastFetchStatus: '',
    lastError: null
};

// ========================================
// API Fetch Functions
// ========================================

async function getOperationDbFromSheet() {
    if (!isOperationDbApiConfigured()) {
        throw new Error('Operation DB API not configured');
    }
    const url = OP_DB_API_BASE_URL + '?action=getOperationDb&_ts=' + Date.now();
    const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'API returned success=false');
    OperationDbState.lastFetchUrl = url;
    OperationDbState.lastFetchStatus = 'success';
    return json.data;
}

async function getOperationDbTableFromSheet(tableName) {
    if (!isOperationDbApiConfigured()) {
        throw new Error('Operation DB API not configured');
    }
    const url = OP_DB_API_BASE_URL + '?action=getTable&table=' + encodeURIComponent(tableName) + '&_ts=' + Date.now();
    const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'API returned success=false');
    return json.data.rows || [];
}

// ========================================
// Normalize Functions
// ========================================

function normalizeSkuDetailsRecord(raw) {
    var r = raw || {};
    var category = String(r.category || '').trim();
    return {
        sku: String(r.sku || '').trim(),
        productName: String(r.product_name || ''),
        category: category,
        productLine: category,
        series: String(r.series || ''),
        lifecycle: String(r.lifecycle || 'Running in the Market'),
        image: String(r.image_url || ''),
        gs1Code: String(r.gs1_code || ''),
        gs1Type: String(r.gs1_type || ''),
        amzAsin: String(r.amz_asin || ''),
        itemDimensions: String(r.item_dimensions || ''),
        itemWeight: String(r.item_weight || ''),
        packageDimensions: String(r.package_dimensions || ''),
        packageWeight: String(r.package_weight || ''),
        cartonDimensions: String(r.carton_dimensions || ''),
        cartonWeight: String(r.carton_weight || ''),
        unitsPerCarton: parseInt(r.units_per_carton) || 0,
        hsCode: String(r.hscode || ''),
        declaredValue: String(r.declared_value || ''),
        minimumPrice: String(r.minimum_price || ''),
        msrp: String(r.msrp || ''),
        sellingPrice: String(r.selling_price || ''),
        pm: String(r.pm || ''),
        createdAt: String(r.created_at || ''),
        updatedAt: String(r.updated_at || ''),
        isSellingMaterial: category.toLowerCase() === 'selling material',
        raw: r
    };
}

function normalizeProductFeatureRecord(raw) {
    var r = raw || {};
    var bullets = [];
    for (var i = 1; i <= 7; i++) {
        var bp = r['bullet_point_' + i];
        if (bp && String(bp).trim()) bullets.push(String(bp).trim());
    }
    return {
        featureId: String(r.feature_id || ''),
        scopeType: String(r.scope_type || '').trim().toLowerCase(),
        scopeId: String(r.scope_id || '').trim(),
        country: String(r.country || ''),
        marketplace: String(r.marketplace || ''),
        language: String(r.language || ''),
        productTitle: String(r.product_title || ''),
        productDescription: String(r.product_description || ''),
        bulletPoints: bullets,
        genericKeyword: String(r.generic_keyword || ''),
        createdAt: String(r.created_at || ''),
        updatedAt: String(r.updated_at || ''),
        raw: r
    };
}

function normalizeSkuHandbookSummaryRecord(raw) {
    var r = raw || {};
    return {
        summaryId: String(r.summary_id || ''),
        sku: String(r.sku || '').trim(),
        summaryType: String(r.summary_type || ''),
        summaryText: String(r.summary_text || ''),
        generatedFrom: String(r.generated_from || ''),
        reviewStatus: String(r.review_status || ''),
        reviewedBy: String(r.reviewed_by || ''),
        updatedAt: String(r.updated_at || ''),
        raw: r
    };
}

function normalizeCampaignRecord(raw) {
    var r = raw || {};
    return {
        campaignId: String(r.campaign_id || ''),
        campaignName: String(r.campaign_name || ''),
        country: String(r.country || ''),
        marketplace: String(r.marketplace || ''),
        promotionType: String(r.promotion_type || ''),
        majorEventFlag: String(r.major_event_flag || ''),
        year: String(r.year || ''),
        startDate: String(r.start_date || ''),
        endDate: String(r.end_date || ''),
        duration: String(r.duration || ''),
        status: String(r.status || ''),
        eventReportingFee: String(r.event_reporting_fee || ''),
        commission: String(r.commission || ''),
        totalSalesAmount: String(r.total_sales_amount || ''),
        totalSalesUnits: String(r.total_sales_units || ''),
        totalAdCost: String(r.total_ad_cost || ''),
        totalAcos: String(r.total_acos || ''),
        source: String(r.source || ''),
        createdAt: String(r.created_at || ''),
        updatedAt: String(r.updated_at || ''),
        performanceSyncStatus: String(r.performance_sync_status || ''),
        performanceSyncedAt: String(r.performance_synced_at || ''),
        raw: r
    };
}

function normalizeCampaignSkuLineRecord(raw) {
    var r = raw || {};
    return {
        campaignSkuLineId: String(r.campaign_sku_line_id || ''),
        campaignId: String(r.campaign_id || ''),
        sku: String(r.sku || '').trim(),
        promoPrice: String(r.promo_price || ''),
        regularPrice: String(r.regular_price || ''),
        discountPercent: String(r.discount_percent || ''),
        specialCondition: String(r.special_condition || ''),
        lps: String(r.lps || ''),
        lineStatus: String(r.line_status || ''),
        salesAmount: String(r.sales_amount || ''),
        salesUnits: String(r.sales_units || ''),
        impressions: String(r.impressions || ''),
        sessions: String(r.sessions || ''),
        clicks: String(r.clicks || ''),
        adCost: String(r.ad_cost || ''),
        ctr: String(r.ctr || ''),
        cvr: String(r.cvr || ''),
        acos: String(r.acos || ''),
        source: String(r.source || ''),
        createdAt: String(r.created_at || ''),
        updatedAt: String(r.updated_at || ''),
        performanceSource: String(r.performance_source || ''),
        performanceUpdatedAt: String(r.performance_updated_at || ''),
        raw: r
    };
}


function normalizeMarketplaceSkuRecord(raw) {
    var r = raw || {};
    return {
        marketplaceSkuId: String(r.marketplace_sku_id || '').trim(),
        sku: String(r.sku || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        siteSku: String(r.site_sku || '').trim(),
        asin: String(r.asin || '').trim(),
        currency: String(r.currency || 'USD').trim(),
        regularPrice: parseFloat(r.regular_price) || 0,
        minimumPrice: parseFloat(r.minimum_price) || 0,
        msrp: parseFloat(r.msrp) || 0,
        marketplaceSkuStatus: String(r.marketplace_sku_status || '').trim(),
        replenishmentModel: String(r.replenishment_model || 'sales_driven').trim(),
        launchDate: String(r.launch_date || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

function normalizePricingListRecord(raw) {
    var r = raw || {};
    return {
        pricingId: String(r.pricing_id || '').trim(),
        marketplaceSkuId: String(r.marketplace_sku_id || '').trim(),
        sku: String(r.sku || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        siteSku: String(r.site_sku || '').trim(),
        asin: String(r.asin || '').trim(),
        currency: String(r.currency || '').trim(),
        baseCurrency: String(r.base_currency || '').trim(),
        baseRegularPrice: parseFloat(r.base_regular_price) || 0,
        baseMinimumPrice: parseFloat(r.base_minimum_price) || 0,
        baseMsrp: parseFloat(r.base_msrp) || 0,
        fxRate: parseFloat(r.fx_rate) || 0,
        fxRateDate: String(r.fx_rate_date || '').trim(),
        autoRegularPrice: parseFloat(r.auto_regular_price) || 0,
        autoMinimumPrice: parseFloat(r.auto_minimum_price) || 0,
        autoMsrp: parseFloat(r.auto_msrp) || 0,
        regularPrice: parseFloat(r.regular_price) || 0,
        minimumPrice: parseFloat(r.minimum_price) || 0,
        msrp: parseFloat(r.msrp) || 0,
        priceSource: String(r.price_source || '').trim(),
        priceStatus: String(r.price_status || '').trim(),
        createdBy: String(r.created_by || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedBy: String(r.updated_by || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

function normalizePricingChangeLogRecord(raw) {
    var r = raw || {};
    return {
        logId: String(r.log_id || '').trim(),
        pricingId: String(r.pricing_id || '').trim(),
        fieldName: String(r.field_name || '').trim(),
        oldValue: String(r.old_value || '').trim(),
        newValue: String(r.new_value || '').trim(),
        changedBy: String(r.changed_by || '').trim(),
        changedAt: String(r.changed_at || '').trim(),
        changeReason: String(r.change_reason || '').trim(),
        raw: r
    };
}

function normalizeFcRegularForecastRecord(raw) {
    var r = raw || {};
    return {
        forecastId: String(r.forecast_id || '').trim(),
        year: String(r.year || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        sku: String(r.sku || '').trim(),
        category: String(r.category || '').trim(),
        series: String(r.series || '').trim(),
        jan: parseFloat(r.jan) || 0,
        feb: parseFloat(r.feb) || 0,
        mar: parseFloat(r.mar) || 0,
        apr: parseFloat(r.apr) || 0,
        may: parseFloat(r.may) || 0,
        jun: parseFloat(r.jun) || 0,
        jul: parseFloat(r.jul) || 0,
        aug: parseFloat(r.aug) || 0,
        sep: parseFloat(r.sep) || 0,
        oct: parseFloat(r.oct) || 0,
        nov: parseFloat(r.nov) || 0,
        dec: parseFloat(r.dec) || 0,
        totalFc: parseFloat(r.total_fc) || 0,
        fcShare: String(r.fc_share || '').trim(),
        forecastStatus: String(r.forecast_status || '').trim(),
        source: String(r.source || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

function normalizeOperationDb(rawDb) {
    var db = rawDb || {};
    return {
        skuDetails: (db.sku_details || []).map(normalizeSkuDetailsRecord).filter(function(r) { return r.sku; }),
        productFeatures: (db.product_features || []).map(normalizeProductFeatureRecord),
        skuHandbookSummaries: (db.sku_handbook_summaries || []).map(normalizeSkuHandbookSummaryRecord),
        campaigns: (db.campaigns || []).map(normalizeCampaignRecord).filter(function(r) { return r.campaignId; }),
        campaignSkuLines: (db.campaign_sku_lines || []).map(normalizeCampaignSkuLineRecord).filter(function(r) { return r.campaignSkuLineId; }),
        marketplaceSkus: (db.marketplace_skus || []).map(normalizeMarketplaceSkuRecord).filter(function(r) { return r.sku; }),
        pricingList: (db.pricing_list || []).map(normalizePricingListRecord).filter(function(r) { return r.pricingId || r.marketplaceSkuId || r.sku; }),
        pricingChangeLog: (db.pricing_change_log || []).map(normalizePricingChangeLogRecord).filter(function(r) { return r.logId || r.pricingId; }),
        fcRegularForecast: (db.fc_regular_forecast || []).map(normalizeFcRegularForecastRecord).filter(function(r) { return r.forecastId || r.sku; })
    };
}

// ========================================
// Product Features Relation
// ========================================

function getProductFeatureForSku(skuItem, productFeatures) {
    if (!skuItem || !productFeatures || productFeatures.length === 0) return null;
    var sku = (skuItem.sku || '').trim().toLowerCase();
    var series = (skuItem.series || '').trim().toLowerCase();
    var category = (skuItem.category || skuItem.productLine || '').trim().toLowerCase();

    // Priority 1: scope_type = sku
    var match = productFeatures.find(function(pf) {
        return pf.scopeType === 'sku' && pf.scopeId.toLowerCase() === sku;
    });
    if (match) return match;

    // Priority 2: scope_type = series
    match = productFeatures.find(function(pf) {
        return pf.scopeType === 'series' && pf.scopeId.toLowerCase() === series;
    });
    if (match) return match;

    // Priority 3: scope_type = category
    match = productFeatures.find(function(pf) {
        return pf.scopeType === 'category' && pf.scopeId.toLowerCase() === category;
    });
    if (match) return match;

    return null;
}

// ========================================
// Merge: SKU Knowledge Items
// ========================================

function buildSkuKnowledgeItems(skuDetails, productFeatures, handbookSummaries) {
    return skuDetails.map(function(item) {
        var pf = getProductFeatureForSku(item, productFeatures);
        var pfMatchLevel = 'none';
        if (pf) {
            var skuLc = (item.sku || '').trim().toLowerCase();
            var seriesLc = (item.series || '').trim().toLowerCase();
            if (pf.scopeType === 'sku' && pf.scopeId.toLowerCase() === skuLc) pfMatchLevel = 'sku';
            else if (pf.scopeType === 'series' && pf.scopeId.toLowerCase() === seriesLc) pfMatchLevel = 'series';
            else pfMatchLevel = 'category';
        }

        // Handbook summary - prioritize: reviewed > ai_draft > any
        var allSummaries = handbookSummaries.filter(function(s) { return s.sku.toLowerCase() === item.sku.toLowerCase(); });
        var summary = null;
        if (allSummaries.length > 0) {
            summary = allSummaries.find(function(s) { return s.reviewStatus === 'reviewed'; })
                || allSummaries.find(function(s) { return s.reviewStatus === 'ai_draft'; })
                || allSummaries[0];
        }

        // displaySummary + summarySource
        var displaySummary = 'Not provided yet.';
        var summarySource = 'none';
        if (summary && summary.summaryText) {
            displaySummary = summary.summaryText;
            if (summary.reviewStatus === 'reviewed') summarySource = 'handbook_summary_reviewed';
            else if (summary.reviewStatus === 'ai_draft') summarySource = 'handbook_summary_ai_draft';
            else summarySource = 'handbook_summary_fallback';
        } else if (pf && pf.productDescription) {
            displaySummary = pf.productDescription.substring(0, 250);
            summarySource = 'product_features_fallback';
        }
        if (item.isSellingMaterial) {
            displaySummary = 'This is an internal selling material / packaging-related SKU used for internal training and operational reference.\n\n' + displaySummary;
        }

        // displayKeyPoints + keyPointsSource
        var displayKeyPoints = [];
        var keyPointsSource = 'none';
        if (pf && pf.bulletPoints && pf.bulletPoints.length > 0) {
            displayKeyPoints = pf.bulletPoints.slice(0, 5);
            keyPointsSource = 'product_features_bullets';
        }

        // rawReferenceContent
        var rawReferenceContent = null;
        if (pf) {
            rawReferenceContent = {
                productTitle: pf.productTitle,
                productDescription: pf.productDescription,
                bulletPoints: pf.bulletPoints,
                genericKeyword: pf.genericKeyword,
                language: pf.language || '',
                source: 'product_features'
            };
        }

        return Object.assign({}, item, {
            productFeature: pf,
            pfMatchLevel: pfMatchLevel,
            handbookSummary: summary,
            displaySummary: displaySummary,
            summarySource: summarySource,
            displayKeyPoints: displayKeyPoints,
            keyPointsSource: keyPointsSource,
            rawReferenceContent: rawReferenceContent,
            isSellingMaterial: item.isSellingMaterial
        });
    });
}

// ========================================
// DB Cache & Public Interface
// ========================================

window._opDbCache = null;

function _buildMockFallbackDb() {
    // Convert existing mock data to normalized format
    var allSkus = [
        ...(window.upcomingSkuData || []).map(function(i) { return Object.assign({}, i, { lifecycle: 'Upcoming SKU' }); }),
        ...(window.runningSkuData || []).map(function(i) { return Object.assign({}, i, { lifecycle: 'Running in the Market' }); }),
        ...(window.phasingOutSkuData || []).map(function(i) { return Object.assign({}, i, { lifecycle: 'Phasing Out' }); })
    ];

    var skuDetails = allSkus.map(function(item) {
        return {
            sku: item.sku || '',
            productName: item.productName || '',
            category: item.category || '',
            productLine: item.category || '',
            series: item.series || '',
            lifecycle: item.lifecycle || 'Running in the Market',
            image: item.image || '',
            gs1Code: item.gs1Code || '',
            gs1Type: item.gs1Type || '',
            amzAsin: item.amzAsin || '',
            itemDimensions: item.itemDimensions || '',
            itemWeight: item.itemWeight || '',
            packageDimensions: item.package || item.packageDimensions || '',
            packageWeight: item.packageWeight || '',
            cartonDimensions: item.cartonDimensions || '',
            cartonWeight: item.cartonWeight || '',
            unitsPerCarton: item.unitsPerCarton || 0,
            hsCode: item.hscode || '',
            declaredValue: item.declaredValue || '',
            minimumPrice: item.minimumPrice || '',
            msrp: item.msrp || '',
            sellingPrice: item.sellingPrice || '',
            pm: item.pm || '',
            createdAt: '',
            updatedAt: '',
            isSellingMaterial: (item.category || '').toLowerCase() === 'selling material',
            raw: item
        };
    });

    return {
        skuDetails: skuDetails,
        productFeatures: [],
        skuHandbookSummaries: [],
        campaigns: [],
        campaignSkuLines: [],
        _sourceMode: 'mock'
    };
}

async function loadOperationDb(options) {
    var force = (options && options.force) || false;
    if (!force && window._opDbCache && window._opDbCache._sourceMode === 'google-sheet') {
        return window._opDbCache;
    }
    if (isOperationDbApiConfigured()) {
        try {
            var rawDb = await getOperationDbFromSheet();
            var normalized = normalizeOperationDb(rawDb);
            normalized._sourceMode = 'google-sheet';
            window._opDbCache = normalized;
            OperationDbState.data = normalized;
            OperationDbState.dataSourceMode = 'google-sheet';
            OperationDbState.lastLoadedAt = new Date().toISOString();
            OperationDbState.lastError = null;
            console.log('[OP DB] Loaded from Google Sheet. SKUs:', normalized.skuDetails.length);
            return normalized;
        } catch (e) {
            console.warn('[OP DB] Google Sheet API failed:', e.message, '- falling back to mock data.');
            OperationDbState.lastFetchStatus = 'failed';
            OperationDbState.lastError = e.message;
            window._opDbCache = _buildMockFallbackDb();
            window._opDbCache._apiFailed = true;
            OperationDbState.dataSourceMode = 'mock';
            OperationDbState.lastLoadedAt = new Date().toISOString();
            return window._opDbCache;
        }
    } else {
        window._opDbCache = _buildMockFallbackDb();
        OperationDbState.dataSourceMode = 'mock';
        OperationDbState.lastLoadedAt = new Date().toISOString();
        console.log('[OP DB] API not configured. Using mock data. SKUs:', window._opDbCache.skuDetails.length);
        return window._opDbCache;
    }
}

// ========================================
// Public KM.DB Interface
// ========================================

if (!window.KM) window.KM = {};
if (!window.KM.DB) window.KM.DB = {};

window.KM.DB.loadOperationDb = loadOperationDb;

window.KM.DB.getSkuDetails = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.skuDetails || [];
};

window.KM.DB.getProductFeatures = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.productFeatures || [];
};

window.KM.DB.getSkuHandbookSummaries = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.skuHandbookSummaries || [];
};

window.KM.DB.getSkuKnowledgeItems = function() {
    if (!window._opDbCache) return [];
    return buildSkuKnowledgeItems(
        window._opDbCache.skuDetails || [],
        window._opDbCache.productFeatures || [],
        window._opDbCache.skuHandbookSummaries || []
    );
};

window.KM.DB.getCampaigns = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.campaigns || [];
};

window.KM.DB.getCampaignSkuLines = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.campaignSkuLines || [];
};

window.KM.DB.getMarketplaceSkus = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.marketplaceSkus || [];
};

window.KM.DB.getPricingList = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.pricingList || [];
};

window.KM.DB.getPricingChangeLog = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.pricingChangeLog || [];
};

window.KM.DB.getFcRegularForecast = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.fcRegularForecast || [];
};


window.KM.DB.getDataSourceMode = function() {
    return getOperationDbDataSourceMode();
};

window.KM.DB.isCloudWriteEnabled = function() {
    return isOperationDbApiConfigured() && getOperationDbDataSourceMode() === 'google-sheet';
};

window.KM.DB.updateSkuLifecycle = async function(sku, lifecycle) {
    if (window.KM.DB.isCloudWriteEnabled()) {
        // Cloud mode: write to Google Sheet
        var result = await updateSkuLifecycleInSheet(sku, lifecycle);
        // Clear localStorage override for this SKU so it doesn't conflict
        var overrides = getSkuLifecycleOverrides();
        if (overrides[sku]) {
            delete overrides[sku];
            localStorage.setItem(SKU_LIFECYCLE_KEY, JSON.stringify(overrides));
        }
        // Reload fresh data
        await loadOperationDb({ force: true });
        return result;
    } else {
        // Mock mode: write to localStorage
        setSkuLifecycleOverride(sku, lifecycle);
        return { sku: sku, lifecycle: lifecycle };
    }
};

async function updateSkuLifecycleInSheet(sku, lifecycle) {
    if (!isOperationDbApiConfigured()) {
        throw new Error('Operation DB API not configured');
    }
    var url = OP_DB_API_BASE_URL;
    var resp = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: 'updateSkuLifecycle',
            sku: sku,
            lifecycle: lifecycle,
            updated_by: 'operation-system'
        })
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Update failed');
    return json.data;
}

// ========================================
// marketplace_skus Write Methods
// ========================================

window.KM.DB.upsertMarketplaceSku = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, upsertMarketplaceSku skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'upsertMarketplaceSku' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert failed');
    await loadOperationDb({ force: true });
    return json.data;
};

window.KM.DB.updateMarketplaceSkuModel = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updateMarketplaceSkuModel skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'updateMarketplaceSkuModel' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Update failed');
    await loadOperationDb({ force: true });
    return json.data;
};

window.KM.DB.importMarketplaceSkusBatch = async function(rows, options) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, importMarketplaceSkusBatch skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: 'importMarketplaceSkusBatch',
            rows: rows || [],
            options: options || {}
        })
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    // Reload DB only after a successful import; return the full API result either way.
    if (json && json.success) {
        await loadOperationDb({ force: true });
    }
    return json;
};

// ========================================
// Debug & Reload Helpers
// ========================================

window.debugOperationDb = function() {
    var mode = getOperationDbDataSourceMode();
    console.log('=== Operation DB Debug ===');
    console.log('Data Source Mode:', mode);
    console.log('Last Loaded At:', OperationDbState.lastLoadedAt || 'never');
    console.log('Last Fetch URL:', OperationDbState.lastFetchUrl || 'none');
    console.log('Last Fetch Status:', OperationDbState.lastFetchStatus || 'none');
    console.log('Last Error:', OperationDbState.lastError || 'none');
    console.log('API Configured:', isOperationDbApiConfigured());
    if (!window._opDbCache) { console.log('DB not loaded yet.'); return; }
    console.log('sku_details count:', (window._opDbCache.skuDetails || []).length);
    console.log('product_features count:', (window._opDbCache.productFeatures || []).length);
    console.log('sku_handbook_summaries count:', (window._opDbCache.skuHandbookSummaries || []).length);
    console.log('sku_knowledge_items count:', window.KM.DB.getSkuKnowledgeItems().length);
    console.log('campaigns count:', (window._opDbCache.campaigns || []).length);
    console.log('campaign_sku_lines count:', (window._opDbCache.campaignSkuLines || []).length);
    console.log('marketplace_skus count:', (window._opDbCache.marketplaceSkus || []).length);
    console.log('pricing_list count:', (window._opDbCache.pricingList || []).length);
    console.log('pricing_change_log count:', (window._opDbCache.pricingChangeLog || []).length);
    console.log('fc_regular_forecast count:', (window._opDbCache.fcRegularForecast || []).length);
    // Language distribution
    var langDist = {};
    (window._opDbCache.productFeatures || []).forEach(function(pf) {
        var lang = pf.language || 'unknown';
        langDist[lang] = (langDist[lang] || 0) + 1;
    });
    console.log('product_features language distribution:', langDist);
    console.log('--- sku_details (first 5) ---');
    console.table((window._opDbCache.skuDetails || []).slice(0, 5).map(function(r) { var c = Object.assign({}, r); delete c.raw; return c; }));
    console.log('--- product_features (first 5) ---');
    console.table((window._opDbCache.productFeatures || []).slice(0, 5).map(function(r) { var c = Object.assign({}, r); delete c.raw; return c; }));
    console.log('--- sku_knowledge_items (first 5) ---');
    var ki = window.KM.DB.getSkuKnowledgeItems().slice(0, 5).map(function(r) {
        return { sku: r.sku, productName: r.productName, lifecycle: r.lifecycle, pfMatch: r.pfMatchLevel, summarySource: r.summarySource, keyPointsSource: r.keyPointsSource, summary: (r.displaySummary || '').substring(0, 60) };
    });
    console.table(ki);
    console.log('=== End Debug ===');
};

window.reloadOperationDb = async function(options) {
    console.log('[OP DB] Reloading (force)...');
    window._opDbCache = null;
    await loadOperationDb({ force: true });
    if (window.renderSkuDetailsTable) renderSkuDetailsTable();
    if (window.renderSkuHandbook) renderSkuHandbook();
    console.log('[OP DB] Reload complete. Mode:', getOperationDbDataSourceMode(), 'SKUs:', (window._opDbCache.skuDetails || []).length, 'at', OperationDbState.lastLoadedAt);
};

window.debugSkuById = function(sku) {
    if (!sku) { console.log('Usage: debugSkuById("CO1100-R")'); return; }
    console.log('=== Debug SKU:', sku, '===');
    console.log('dataSourceMode:', getOperationDbDataSourceMode());
    var dbItems = window.KM.DB.getSkuDetails();
    var dbItem = dbItems.find(function(i) { return i.sku === sku; });
    console.log('1. Normalized SKU data:', dbItem || 'NOT FOUND');
    if (!dbItem) { console.log('=== End Debug SKU ==='); return; }
    var lcOverrides = getSkuLifecycleOverrides();
    console.log('2. Lifecycle override:', lcOverrides[sku] || 'none');
    var imgOverrides = getSkuImageOverrides();
    console.log('3. Image override:', imgOverrides[sku] || 'none');
    console.log('4. Final lifecycle:', getNormalizedSkuStatus(dbItem));
    console.log('5. Final image:', getNormalizedSkuImage(dbItem));
    // Product feature match
    var pfs = window._opDbCache ? (window._opDbCache.productFeatures || []) : [];
    var pf = getProductFeatureForSku(dbItem, pfs);
    var matchLevel = 'none';
    if (pf) {
        var skuLc = dbItem.sku.trim().toLowerCase();
        var seriesLc = (dbItem.series || '').trim().toLowerCase();
        if (pf.scopeType === 'sku' && pf.scopeId.toLowerCase() === skuLc) matchLevel = 'sku';
        else if (pf.scopeType === 'series' && pf.scopeId.toLowerCase() === seriesLc) matchLevel = 'series';
        else matchLevel = 'category';
    }
    console.log('6. Product feature match:', pf ? { scopeType: pf.scopeType, scopeId: pf.scopeId, matchLevel: matchLevel, language: pf.language, title: (pf.productTitle || '').substring(0, 60) } : 'none');
    // Handbook summary
    var summaries = window._opDbCache ? (window._opDbCache.skuHandbookSummaries || []) : [];
    var allMatches = summaries.filter(function(s) { return s.sku.toLowerCase() === sku.toLowerCase(); });
    var summary = allMatches.find(function(s) { return s.reviewStatus === 'reviewed'; })
        || allMatches.find(function(s) { return s.reviewStatus === 'ai_draft'; })
        || allMatches[0] || null;
    console.log('7. Handbook summary:', summary || 'none (empty)');
    // Build knowledge item for this SKU
    var knowledgeItems = buildSkuKnowledgeItems([dbItem], pfs, summaries);
    var ki = knowledgeItems[0];
    console.log('8. displaySummary:', (ki.displaySummary || '').substring(0, 120));
    console.log('9. summarySource:', ki.summarySource);
    console.log('10. displayKeyPoints:', ki.displayKeyPoints);
    console.log('11. keyPointsSource:', ki.keyPointsSource);
    console.log('12. pfMatchLevel:', ki.pfMatchLevel);
    console.log('13. productFeature.language:', pf ? pf.language : 'n/a');
    console.log('=== End Debug SKU ===');
};

window.testUpdateSkuLifecycle = async function(sku, lifecycle) {
    console.log('[Test] Updating', sku, 'to', lifecycle);
    try {
        var result = await window.KM.DB.updateSkuLifecycle(sku, lifecycle);
        console.log('[Test] Success:', result);
        window.debugSkuById(sku);
    } catch (err) {
        console.error('[Test] Failed:', err.message);
    }
};

// ========================================
// Expose normalize functions for testing
// ========================================
window.normalizeSkuDetailsRecord = normalizeSkuDetailsRecord;
window.normalizeProductFeatureRecord = normalizeProductFeatureRecord;
window.normalizeSkuHandbookSummaryRecord = normalizeSkuHandbookSummaryRecord;
window.normalizeCampaignRecord = normalizeCampaignRecord;
window.normalizeCampaignSkuLineRecord = normalizeCampaignSkuLineRecord;
window.normalizeOperationDb = normalizeOperationDb;
window.buildSkuKnowledgeItems = buildSkuKnowledgeItems;
window.getProductFeatureForSku = getProductFeatureForSku;
window.isOperationDbApiConfigured = isOperationDbApiConfigured;


// ========================================
// SKU Handbook Data Audit Helper
// ========================================

window.auditSkuHandbookData = function() {
    console.log('=== SKU Handbook Data Audit ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Data Source Mode:', getOperationDbDataSourceMode());
    console.log('');

    if (!window._opDbCache) { console.log('DB not loaded. Run reloadOperationDb() first.'); return; }

    var skuDetails = window._opDbCache.skuDetails || [];
    var productFeatures = window._opDbCache.productFeatures || [];
    var summaries = window._opDbCache.skuHandbookSummaries || [];
    var knowledgeItems = window.KM.DB.getSkuKnowledgeItems();

    // === A. Table Counts ===
    console.log('--- 1. Table Counts ---');
    console.log('sku_details:', skuDetails.length);
    console.log('product_features:', productFeatures.length);
    console.log('sku_handbook_summaries:', summaries.length);
    console.log('sku_knowledge_items:', knowledgeItems.length);
    console.log('');

    // === B. Product Feature Match Coverage ===
    console.log('--- 2. Product Feature Coverage ---');
    var matchCounts = { sku: 0, series: 0, category: 0, none: 0 };
    var noMatchItems = [];
    knowledgeItems.forEach(function(ki) {
        var level = ki.pfMatchLevel || 'none';
        matchCounts[level] = (matchCounts[level] || 0) + 1;
        if (level === 'none') {
            noMatchItems.push({ sku: ki.sku, productName: ki.productName, category: ki.category || ki.productLine, series: ki.series, lifecycle: ki.lifecycle });
        }
    });
    console.log('Match by SKU:', matchCounts.sku);
    console.log('Match by Series:', matchCounts.series);
    console.log('Match by Category:', matchCounts.category);
    console.log('No match:', matchCounts.none);
    if (noMatchItems.length > 0) {
        console.log('SKUs without product_features (first 30):');
        console.table(noMatchItems.slice(0, 30));
    }
    console.log('');

    // === C. Unused Product Features ===
    console.log('--- 3. Unused Product Features ---');
    var usedPfIds = new Set();
    knowledgeItems.forEach(function(ki) {
        if (ki.productFeature) usedPfIds.add(ki.productFeature);
    });
    var unusedPfs = productFeatures.filter(function(pf) { return !usedPfIds.has(pf); });
    console.log('Unused product_features count:', unusedPfs.length);
    if (unusedPfs.length > 0) {
        console.table(unusedPfs.map(function(pf) {
            return { featureId: pf.featureId, scopeType: pf.scopeType, scopeId: pf.scopeId, country: pf.country, marketplace: pf.marketplace, language: pf.language, productTitle: (pf.productTitle || '').substring(0, 50) };
        }));
    }
    console.log('');

    // === D. Missing Summary / Key Points ===
    console.log('--- 4. Missing Content ---');
    var missingSummary = knowledgeItems.filter(function(ki) { return ki.summarySource === 'none'; });
    var missingKeyPoints = knowledgeItems.filter(function(ki) { return ki.keyPointsSource === 'none'; });
    console.log('SKUs with no displaySummary:', missingSummary.length);
    if (missingSummary.length > 0) {
        console.table(missingSummary.slice(0, 30).map(function(ki) {
            return { sku: ki.sku, productName: ki.productName, category: ki.category, series: ki.series, matchLevel: ki.pfMatchLevel, summarySource: ki.summarySource, keyPointsSource: ki.keyPointsSource };
        }));
    }
    console.log('SKUs with no displayKeyPoints:', missingKeyPoints.length);
    if (missingKeyPoints.length > 0 && missingKeyPoints.length !== missingSummary.length) {
        console.table(missingKeyPoints.slice(0, 30).map(function(ki) {
            return { sku: ki.sku, productName: ki.productName, category: ki.category, series: ki.series, matchLevel: ki.pfMatchLevel, summarySource: ki.summarySource, keyPointsSource: ki.keyPointsSource };
        }));
    }
    console.log('');

    // === E. Selling Material ===
    console.log('--- 5. Selling Material ---');
    var sellingMaterials = knowledgeItems.filter(function(ki) { return ki.isSellingMaterial; });
    console.log('Selling Material SKU count:', sellingMaterials.length);
    if (sellingMaterials.length > 0) {
        console.table(sellingMaterials.map(function(ki) {
            return { sku: ki.sku, productName: ki.productName, category: ki.category, series: ki.series, lifecycle: ki.lifecycle, hasProductFeature: !!ki.productFeature, summarySource: ki.summarySource };
        }));
    }
    console.log('');

    // === F. Image URL Check ===
    console.log('--- 6. Image URL Format ---');
    var imgEmpty = 0, imgRelative = 0, imgAbsolute = 0;
    skuDetails.forEach(function(s) {
        var img = s.image || '';
        if (!img) imgEmpty++;
        else if (img.startsWith('http://') || img.startsWith('https://')) imgAbsolute++;
        else imgRelative++;
    });
    console.log('Empty:', imgEmpty);
    console.log('Relative path:', imgRelative);
    console.log('Absolute URL:', imgAbsolute);
    console.log('');

    // === G. Lifecycle Distribution ===
    console.log('--- 7. Lifecycle Distribution ---');
    var lcDist = {};
    var invalidLc = [];
    var validLc = ['Upcoming SKU', 'Running in the Market', 'Phasing Out', 'Closure', 'Other'];
    skuDetails.forEach(function(s) {
        var lc = s.lifecycle || '(empty)';
        lcDist[lc] = (lcDist[lc] || 0) + 1;
        if (validLc.indexOf(lc) === -1 && lc !== '(empty)') {
            invalidLc.push({ sku: s.sku, lifecycle: lc });
        }
    });
    console.log(lcDist);
    if (invalidLc.length > 0) {
        console.log('Invalid lifecycle values:');
        console.table(invalidLc);
    }
    console.log('');

    // === H. Language Distribution ===
    console.log('--- 8. Product Features Language Distribution ---');
    var langDist = {};
    productFeatures.forEach(function(pf) {
        var lang = pf.language || '(empty)';
        langDist[lang] = (langDist[lang] || 0) + 1;
    });
    console.log(langDist);
    console.log('');

    // === I. Duplicate SKU Check ===
    console.log('--- 9. Duplicate Checks ---');
    var skuCount = {};
    skuDetails.forEach(function(s) { skuCount[s.sku] = (skuCount[s.sku] || 0) + 1; });
    var dupSkus = Object.entries(skuCount).filter(function(e) { return e[1] > 1; });
    console.log('Duplicate SKUs:', dupSkus.length);
    if (dupSkus.length > 0) {
        console.table(dupSkus.map(function(e) { return { sku: e[0], count: e[1] }; }));
    }

    // === J. Duplicate Product Feature Scope ===
    var pfScopeCount = {};
    productFeatures.forEach(function(pf) {
        var key = [pf.scopeType, pf.scopeId, pf.country, pf.marketplace, pf.language].join('|');
        pfScopeCount[key] = (pfScopeCount[key] || 0) + 1;
    });
    var dupPfScopes = Object.entries(pfScopeCount).filter(function(e) { return e[1] > 1; });
    console.log('Duplicate product_features scopes:', dupPfScopes.length);
    if (dupPfScopes.length > 0) {
        console.table(dupPfScopes.map(function(e) {
            var parts = e[0].split('|');
            return { scopeType: parts[0], scopeId: parts[1], country: parts[2], marketplace: parts[3], language: parts[4], count: e[1] };
        }));
    }
    console.log('');

    // === Summary ===
    console.log('--- 10. Recommended Fixes ---');
    if (matchCounts.none > 0) console.log('- Add product_features for ' + matchCounts.none + ' SKUs without coverage (by series or category).');
    if (missingSummary.length > 0) console.log('- ' + missingSummary.length + ' SKUs have no summary content. Add product_features or sku_handbook_summaries.');
    if (imgEmpty > 0) console.log('- ' + imgEmpty + ' SKUs have no image_url. Add image paths to Google Sheet.');
    if (dupSkus.length > 0) console.log('- ' + dupSkus.length + ' duplicate SKUs found in sku_details. Clean up Google Sheet.');
    if (dupPfScopes.length > 0) console.log('- ' + dupPfScopes.length + ' duplicate product_features scopes. May cause wrong feature matching.');
    if (invalidLc.length > 0) console.log('- ' + invalidLc.length + ' SKUs have non-standard lifecycle values. Standardize in Google Sheet.');
    if (matchCounts.none === 0 && missingSummary.length === 0 && imgEmpty === 0 && dupSkus.length === 0) {
        console.log('All checks passed. Data looks healthy!');
    }
    console.log('');
    console.log('=== End Audit ===');
};


// ========================================
// Legacy SKU Override Debug Helper
// ========================================

window.debugLegacySkuOverrides = function() {
    console.log('=== Legacy SKU Overrides Debug ===');
    var lcOverrides = {};
    var imgOverrides = {};
    var dataOverrides = {};
    try { lcOverrides = JSON.parse(localStorage.getItem('km_sku_lifecycle_overrides_v1')) || {}; } catch(e) {}
    try { imgOverrides = JSON.parse(localStorage.getItem('km_sku_image_overrides_v1')) || {}; } catch(e) {}
    try { dataOverrides = JSON.parse(localStorage.getItem('km_sku_data_overrides_v1')) || {}; } catch(e) {}

    var lcCount = Object.keys(lcOverrides).length;
    var imgCount = Object.keys(imgOverrides).length;
    var dataCount = Object.keys(dataOverrides).length;

    console.log('Lifecycle overrides:', lcCount);
    console.log('Image overrides:', imgCount);
    console.log('Imported SKU data overrides:', dataCount);

    if (lcCount > 0) {
        console.log('--- Lifecycle overrides (first 10) ---');
        console.table(Object.entries(lcOverrides).slice(0, 10).map(function(e) { return { sku: e[0], lifecycle: e[1].lifecycle, updatedAt: e[1].updatedAt }; }));
    }
    if (imgCount > 0) {
        console.log('--- Image overrides (first 10) ---');
        console.table(Object.entries(imgOverrides).slice(0, 10).map(function(e) { return { sku: e[0], image: e[1].image, updatedAt: e[1].updatedAt }; }));
    }
    if (dataCount > 0) {
        console.warn('[Warning] Legacy imported SKU records detected in localStorage. These may create phantom SKUs. Run resetSkuHandbookOverrides() to clear after confirming migration.');
        console.log('--- Imported SKU data overrides (first 10) ---');
        console.table(Object.entries(dataOverrides).slice(0, 10).map(function(e) { return { sku: e[0], productName: e[1].productName || '', lifecycle: e[1].status || e[1].lifecycle || '', updatedAt: e[1].updatedAt || '' }; }));
    }
    if (lcCount === 0 && imgCount === 0 && dataCount === 0) {
        console.log('No legacy overrides found. Clean state.');
    }
    console.log('=== End ===');
};
