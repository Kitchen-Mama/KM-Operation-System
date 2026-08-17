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
    function s(v) { return String(v == null ? '' : v).trim(); }
    // Compose "L x W x H" (numeric only — unit lives in the column header / unit toggle).
    function dim3(l, w, h) {
        var a = [s(l), s(w), s(h)];
        if (a[0] === '' && a[1] === '' && a[2] === '') return '';
        return a.join(' × ');   // "L × W × H" (× is also accepted by the CM/IN converter)
    }
    // New split columns take priority; fall back to the legacy combined column when split is empty.
    var itemDim = dim3(r.item_length, r.item_width, r.item_height) || s(r.item_dimensions);
    var itemDim2 = dim3(r.item_length_2, r.item_width_2, r.item_height_2);   // secondary (display only)
    var packageDim = dim3(r.package_length, r.package_width, r.package_height) || s(r.package_dimensions);
    var cartonDim = dim3(r.carton_length, r.carton_width, r.carton_height) || s(r.carton_dimensions);
    return {
        sku: s(r.sku),
        productName: String(r.product_name || ''),
        productNameCn: String(r.product_name_cn || ''),   // Chinese customs/product name (nullable)
        productUse: s(r.product_use),                     // customs-facing product usage description (nullable)
        category: category,
        productLine: category,
        series: String(r.series || ''),
        lifecycle: String(r.lifecycle || 'Running in the Market'),
        image: String(r.image_url || ''),
        gs1Code: s(r.gs1_code),
        gs1Type: s(r.gs1_type),
        amzAsin: s(r.amz_asin),

        // --- Item dimensions (split + secondary + composed display) ---
        itemLength: s(r.item_length), itemWidth: s(r.item_width), itemHeight: s(r.item_height),
        itemLength2: s(r.item_length_2), itemWidth2: s(r.item_width_2), itemHeight2: s(r.item_height_2),
        itemDimensionUnit: s(r.item_dimension_unit),
        itemDimensions: itemDim,        // composed PRIMARY ("L x W x H") — drives the table + unit toggle
        itemDimensions2: itemDim2,      // composed SECONDARY ("" when *_2 all blank) — display only
        itemWeight: s(r.item_weight),
        itemWeightUnit: s(r.item_weight_unit),

        // --- Package dimensions ---
        packageLength: s(r.package_length), packageWidth: s(r.package_width), packageHeight: s(r.package_height),
        packageDimensionUnit: s(r.package_dimension_unit),
        packageDimensions: packageDim,
        packageWeight: s(r.package_weight),
        packageWeightUnit: s(r.package_weight_unit),

        // --- Carton dimensions (the logistics / CBM basis) ---
        cartonLength: s(r.carton_length), cartonWidth: s(r.carton_width), cartonHeight: s(r.carton_height),
        cartonDimensionUnit: s(r.carton_dimension_unit),
        cartonDimensions: cartonDim,
        cartonWeight: s(r.carton_weight),
        cartonWeightUnit: s(r.carton_weight_unit),
        unitsPerCarton: parseInt(r.units_per_carton) || 0,

        // --- Product attributes (SKU Domain v2.0) ---
        material: s(r.material),
        batteryType: s(r.battery_type),
        magnetType: s(r.magnet_type),

        // --- Brand baseline price (v2.0: single base_currency for all three) ---
        minimumPrice: s(r.minimum_price),
        msrp: s(r.msrp),
        sellingPrice: s(r.selling_price),
        // base_currency is canonical; fall back to legacy *_unit only when blank (read-only migration aid).
        baseCurrency: s(r.base_currency) || s(r.minimum_price_unit) || s(r.msrp_unit) || s(r.selling_unit),

        // --- DEPRECATED (read-fallback only; moved to tax_referral_rates / replaced by base_currency).
        //     Still surfaced for back-compat readers; SKU Details no longer displays or writes these. ---
        hsCode: s(r.hscode),
        declaredValue: s(r.declared_value), declaredValueUnit: s(r.declared_value_unit),
        minimumPriceUnit: s(r.minimum_price_unit), msrpUnit: s(r.msrp_unit), sellingUnit: s(r.selling_unit),

        pm: String(r.pm || ''),
        createdAt: s(r.created_at),
        updatedAt: s(r.updated_at),
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
        // Additive identity (2026-07-22): a campaign is NOT uniquely scoped by country+marketplace
        // alone — the same marketplace name can belong to two companies (KM vs ResUS). company +
        // marketplaceId are the company-safe identity; country/marketplace remain display snapshots.
        company: String(r.company || ''),
        marketplaceId: String(r.marketplace_id || ''),
        country: String(r.country || ''),
        marketplace: String(r.marketplace || ''),
        eventFlag: String(r.event_flag || r.major_event_flag || ''),
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
        // Additive canonical marketplace-SKU identity (2026-07-22); sku kept as Master-SKU snapshot.
        marketplaceSkuId: String(r.marketplace_sku_id || ''),
        sku: String(r.sku || '').trim(),
        promoPrice: String(r.promo_price || ''),
        regularPrice: String(r.regular_price || ''),
        // pricing_list currency snapshot for this line's Regular / Deal price (USD/CAD/AUD/…). NOT a sales value.
        priceUnits: String(r.price_units || ''),
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
        marketplaceId: String(r.marketplace_id || '').trim(),
        company: String(r.company || '').trim(),
        sku: String(r.sku || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        siteSku: String(r.site_sku || '').trim(),
        // Canonical platform-neutral product id (SKU Domain v2.0). Amazon ASIN stored here; UI may label
        // it "ASIN". Legacy `asin` is READ-fallback only during migration — never written.
        marketplaceProductId: String(r.marketplace_product_id || r.asin || '').trim(),
        asin: String(r.asin || '').trim(),   // legacy read-only alias (do not write)
        currency: String(r.currency || 'USD').trim(),
        regularPrice: parseFloat(r.regular_price) || 0,
        minimumPrice: parseFloat(r.minimum_price) || 0,
        msrp: parseFloat(r.msrp) || 0,
        marketplaceSkuStatus: String(r.marketplace_sku_status || '').trim(),
        replenishmentModel: String(r.replenishment_model || 'sales_driven').trim(),
        // Fulfillment model (SKU-level override). Empty when the column is absent — the
        // marketplace-level model then applies. Values: platform_fulfilled | self_fulfilled | hybrid.
        fulfillmentModel: String(r.fulfillment_model || '').trim(),
        launchDate: String(r.launch_date || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

// Inventory namespace migration (2026-07-21): Factory Stock balance columns are `fac_*`, Overseas
// Warehouse Inventory columns are `wh_*`. TEMPORARY dual-read prefers the new canonical header and falls
// back to the pre-migration name only while the header is absent. REMOVAL CONDITION: delete the old-key
// fallback once the live sheets are renamed and verified (see project-current-state migration entry).
function _invPick(r, canonicalKey, legacyKey) {
    var v = r ? r[canonicalKey] : undefined;
    return (v === undefined || v === null || v === '') ? (r ? r[legacyKey] : undefined) : v;
}

function normalizeFactoryStockRecord(raw) {
    var r = raw || {};
    return {
        factoryStockId: String(r.factory_stock_id || '').trim(),
        sku: String(r.sku || '').trim(),
        // Current factory_stock schema has NO company / factory_name — company & factory name are
        // joined from warehouses via warehouse_id. Legacy fields kept only as defensive fallbacks.
        warehouseId: String(r.warehouse_id || '').trim(),
        company: String(r.company || '').trim(),
        factoryName: String(r.factory_name || '').trim(),
        currentStock: parseFloat(_invPick(r, 'fac_current_stock', 'current_stock')) || 0,   // canonical fac_current_stock
        reservedStock: parseFloat(_invPick(r, 'fac_reserved_stock', 'reserved_stock')) || 0, // canonical fac_reserved_stock
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        lastTransactionAt: String(r.last_transaction_at || '').trim(),
        raw: r
    };
}

function normalizeFactoryStockMovementRecord(raw) {
    var r = raw || {};
    // Canonical factory_stock_movements schema (SHIPMENT_CENTER_SPEC §, finalized):
    //   factory_stock_movement_id, movement_date, sku, warehouse_id, movement_type, qty,
    //   related_entity_type, related_entity_id, before_current_stock, after_current_stock,
    //   before_reserved_stock, after_reserved_stock, note, created_by, created_at
    // The manual Inventory Adjustment writer (handleAdjustFactoryInventory_) fills the 4-way
    // before/after audit columns. Legacy before_qty/after_qty are kept only as defensive fallbacks.
    var num = function(v) { return (v == null || v === '') ? null : (parseFloat(v)); };
    var beforeCurrent = num(r.before_current_stock);
    var afterCurrent = num(r.after_current_stock);
    var beforeReserved = num(r.before_reserved_stock);
    var afterReserved = num(r.after_reserved_stock);
    // Derived available before/after (current - reserved) when the 4-way columns are present;
    // otherwise fall back to legacy before_qty/after_qty (which already carried the tracked balance).
    var availBefore = (beforeCurrent != null && beforeReserved != null)
        ? (beforeCurrent - beforeReserved)
        : (parseFloat(r.before_qty != null && r.before_qty !== '' ? r.before_qty : r.quantity_before) || 0);
    var availAfter = (afterCurrent != null && afterReserved != null)
        ? (afterCurrent - afterReserved)
        : (parseFloat(r.after_qty != null && r.after_qty !== '' ? r.after_qty : r.quantity_after) || 0);
    return {
        movementId: String(r.factory_stock_movement_id || r.movement_id || '').trim(),
        movementDate: String(r.movement_date || '').trim(),
        warehouseId: String(r.warehouse_id || '').trim(),
        factoryName: String(r.factory_name || '').trim(),
        sku: String(r.sku || '').trim(),
        movementType: String(r.movement_type || '').trim(),
        quantity: parseFloat(r.qty != null && r.qty !== '' ? r.qty : r.quantity) || 0,
        // Available before/after (primary "before → after" for the movement log).
        availableBefore: availBefore,
        availableAfter: availAfter,
        // Full 4-way audit (null when absent — never fabricated as 0).
        beforeCurrentStock: beforeCurrent,
        afterCurrentStock: afterCurrent,
        beforeReservedStock: beforeReserved,
        afterReservedStock: afterReserved,
        // Legacy generic before/after kept for backward-compatible display.
        quantityBefore: parseFloat(r.before_qty != null && r.before_qty !== '' ? r.before_qty : r.quantity_before) || 0,
        quantityAfter: parseFloat(r.after_qty != null && r.after_qty !== '' ? r.after_qty : r.quantity_after) || 0,
        relatedEntityType: String(r.related_entity_type || r.reference_type || '').trim(),
        relatedEntityId: String(r.related_entity_id || r.reference_id || '').trim(),
        createdBy: String(r.created_by || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

function normalizeMarketplaceRecord(raw) {
    var r = raw || {};
    return {
        marketplaceId: String(r.marketplace_id || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        marketplaceDisplayName: String(r.marketplace_display_name || '').trim(),
        marketplaceAlias: String(r.marketplace_alias || '').trim(),
        // Fulfillment model: platform_fulfilled | self_fulfilled | hybrid (empty when column absent).
        fulfillmentModel: String(r.fulfillment_model || '').trim(),
        // Shared overseas inventory allocation priority (higher = higher priority). 0 when absent.
        allocationPriority: parseFloat(r.allocation_priority) || 0,
        currency: String(r.currency || '').trim(),
        status: String(r.status || '').trim(),
        createdBy: String(r.created_by || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedBy: String(r.updated_by || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

function normalizePricingListRecord(raw) {
    var r = raw || {};
    return {
        pricingId: String(r.pricing_id || '').trim(),
        marketplaceSkuId: String(r.marketplace_sku_id || '').trim(),
        marketplaceId: String(r.marketplace_id || '').trim(),
        company: String(r.company || '').trim(),
        sku: String(r.sku || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        siteSku: String(r.site_sku || '').trim(),
        // Canonical platform-neutral product id (SKU Domain v2.0); legacy `asin` READ-fallback only.
        marketplaceProductId: String(r.marketplace_product_id || r.asin || '').trim(),
        asin: String(r.asin || '').trim(),   // legacy read-only alias (do not write)
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

// replenishment_demand_allocation_rules (Phase-1 multi-warehouse demand allocation authority, F1-4B-E).
// Read-only normalization of the user-owned config sheet (REPLENISHMENT_DEMAND_ALLOCATION_RULES_SPEC.md).
// Ratios stay numbers (null when blank/non-numeric — never coerced to 0); `raw` is retained so the pure
// demand-allocation runtime (KMDAL) can read the canonical snake_case fields directly.
function normalizeReplenishmentDemandAllocationRuleRecord(raw) {
    var r = raw || {};
    function numOrNull(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
    return {
        allocationRuleId: String(r.allocation_rule_id || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        destinationWarehouseId: String(r.destination_warehouse_id || '').trim(),
        forecastAllocationRatio: numOrNull(r.forecast_allocation_ratio),
        salesAllocationRatio: numOrNull(r.sales_allocation_ratio),
        status: String(r.status || '').trim(),
        effectiveFrom: String(r.effective_from || '').trim(),
        effectiveTo: String(r.effective_to || '').trim(),
        version: String(r.version || '').trim(),
        updatedBy: String(r.updated_by || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

// Interpret a Sheet boolean-ish cell as a real tri-state: true / false / null (blank/unknown).
// Never Boolean(value) — an "N"/"No"/"0"/"FALSE" string is truthy and would flip the flag.
function _whBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === '') return null;
    if (s === 'true' || s === 'yes' || s === 'y' || s === '1') return true;
    if (s === 'false' || s === 'no' || s === 'n' || s === '0') return false;
    return null;
}

function normalizeWarehouseRecord(raw) {
    var r = raw || {};
    return {
        warehouseId: String(r.warehouse_id || '').trim(),
        // System-derived snapshot source for the Shipment Draft Warehouse Picker: the picker copies
        // this into shipments.warehouse_code (never free-typed). Empty if the sheet has no such column.
        warehouseCode: String(r.warehouse_code || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        warehouseName: String(r.warehouse_name || '').trim(),
        warehouseType: String(r.warehouse_type || '').trim(),
        // Optional: surfaced for Movement Log marketplace filter. Empty if the sheet has no such column.
        marketplace: String(r.marketplace || '').trim(),
        // Picker filtering/eligibility inputs (§22.0 F/G/H). warehouseOwner = physical operator (Amazon/WINIT/...).
        // isActive / isFactoryWarehouse are tri-state (true/false/null) — see _whBool. logisticsRegion + city/state
        // drive candidate ordering and option display. All empty/null when the sheet lacks the column.
        warehouseOwner: String(r.warehouse_owner || '').trim(),
        isActive: _whBool(r.is_active),
        isFactoryWarehouse: _whBool(r.is_factory_warehouse),
        logisticsRegion: String(r.logistics_region || '').trim(),
        city: String(r.city || '').trim(),
        state: String(r.state || '').trim(),
        status: String(r.status || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

function normalizeOverseasInventorySnapshotRecord(raw) {
    var r = raw || {};
    return {
        snapshotId: String(r.snapshot_id || '').trim(),
        snapshotDate: String(r.snapshot_date || '').trim(),
        warehouseId: String(r.warehouse_id || '').trim(),
        sku: String(r.sku || '').trim(),
        siteSku: String(r.site_sku || '').trim(),
        physicalStock: parseFloat(_invPick(r, 'wh_physical_stock', 'physical_stock')) || 0,
        availableStock: parseFloat(_invPick(r, 'wh_available_stock', 'available_stock')) || 0,
        reservedStock: parseFloat(_invPick(r, 'wh_reserved_stock', 'reserved_stock')) || 0,
        damagedStock: parseFloat(_invPick(r, 'wh_damaged_stock', 'damaged_stock')) || 0,
        onTheWayQty: parseFloat(_invPick(r, 'wh_on_the_way_qty', 'on_the_way_qty')) || 0,
        onTheWayEta: String(_invPick(r, 'wh_on_the_way_eta', 'on_the_way_eta') || '').trim(),
        onTheWayBucket: String(_invPick(r, 'wh_on_the_way_bucket', 'on_the_way_bucket') || '').trim(),
        eventStatus: String(r.event_status || '').trim(),
        // Optional warning-threshold columns (read-only; absent -> 0). Used by MVP display warning only.
        reorderPoint: parseFloat(r.reorder_point) || 0,
        overstockPoint: parseFloat(r.overstock_point) || 0,
        lastMovementAt: String(r.last_movement_at || '').trim(),
        note: String(r.note || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

function normalizeOverseasInventoryMovementRecord(raw) {
    var r = raw || {};
    return {
        movementId: String(r.movement_id || '').trim(),
        movementDate: String(r.movement_date || '').trim(),
        warehouseId: String(r.warehouse_id || '').trim(),
        sku: String(r.sku || '').trim(),
        siteSku: String(r.site_sku || '').trim(),
        movementType: String(r.movement_type || '').trim(),
        // Stock-direction fields (additive; empty if the sheet lacks these columns).
        // Allowed values: available | reserved | damaged | on_the_way | none
        fromStockType: String(r.from_stock_type || '').trim(),
        toStockType: String(r.to_stock_type || '').trim(),
        quantity: parseFloat(_invPick(r, 'wh_quantity', 'quantity')) || 0,
        quantityBefore: parseFloat(_invPick(r, 'wh_quantity_before', 'quantity_before')) || 0,
        quantityAfter: parseFloat(_invPick(r, 'wh_quantity_after', 'quantity_after')) || 0,
        referenceType: String(r.reference_type || '').trim(),
        referenceId: String(r.reference_id || '').trim(),
        sourceModule: String(r.source_module || '').trim(),
        reason: String(r.reason || '').trim(),
        createdBy: String(r.created_by || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

// ---- Amazon snapshot + forecast-event source readers (read-only; import-populated tables) ----
// These tables are import-only (see AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md). They live in a
// separate Amazon destination spreadsheet; when the operation-DB payload does not include them
// these normalize to [] and every downstream mapping must safe-fallback to 0 (no fabricated data).

function normalizeAmazonInventorySnapshotRecord(raw) {
    var r = raw || {};
    return {
        snapshotDate: String(r.snapshot_date || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || 'Amazon').trim(),
        sku: String(r.sku || '').trim(),
        asin: String(r.asin || '').trim(),
        availableQty: parseFloat(r.available_qty) || 0,
        fcTransferQty: parseFloat(r.fc_transfer_qty) || 0,
        fcProcessingQty: parseFloat(r.fc_processing_qty) || 0,
        customerOrderQty: parseFloat(r.customer_order_qty) || 0,
        unfulfillableQty: parseFloat(r.unfulfillable_qty) || 0,
        raw: r
    };
}

function normalizeAmazonInventoryHealthSnapshotRecord(raw) {
    var r = raw || {};
    return {
        snapshotDate: String(r.snapshot_date || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || 'Amazon').trim(),
        sku: String(r.sku || '').trim(),
        invAge0To90Days: parseFloat(r.inv_age_0_to_90_days) || 0,
        invAge91To180Days: parseFloat(r.inv_age_91_to_180_days) || 0,
        invAge181To270Days: parseFloat(r.inv_age_181_to_270_days) || 0,
        invAge271To365Days: parseFloat(r.inv_age_271_to_365_days) || 0,
        // Finer top buckets — may be absent in the current source (top bucket is inv_age_365_plus_days).
        // Safe fallback to 0 so Over 180+ never errors (see INVENTORY_TABLE_MAPPING_SPEC §5).
        invAge366To455Days: parseFloat(r.inv_age_366_to_455_days) || 0,
        invAge456PlusDays: parseFloat(r.inv_age_456_plus_days) || 0,
        invAge365PlusDays: parseFloat(r.inv_age_365_plus_days) || 0,
        raw: r
    };
}

function normalizeAmazonDailySalesSnapshotRecord(raw) {
    var r = raw || {};
    return {
        snapshotDate: String(r.snapshot_date || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || 'Amazon').trim(),
        channel: String(r.channel || '').trim(),
        sku: String(r.sku || '').trim(),
        salesUnits: parseFloat(r.sales_units) || 0,
        raw: r
    };
}

function normalizeAmazonWeeklySalesSnapshotRecord(raw) {
    var r = raw || {};
    return {
        snapshotWeek: String(r.snapshot_week || '').trim(),
        weekEndDate: String(r.week_end_date || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || 'Amazon').trim(),
        channel: String(r.channel || '').trim(),
        sku: String(r.sku || '').trim(),
        salesUnits7d: parseFloat(r.sales_units_7d) || 0,
        raw: r
    };
}

// Parse a free-text event_period ("2026/07/15-2026/07/16", "2026-07-15 ~ 2026-07-16", etc.) into
// { start, end } ISO yyyy-mm-dd strings. Returns blanks when it cannot confidently parse two dates.
// Used only as a FALLBACK for legacy rows that predate the event_start_date / event_end_date columns.
function _fcParseEventPeriodDates(period) {
    var out = { start: '', end: '' };
    var s = String(period == null ? '' : period).trim();
    if (!s) return out;
    // Find all yyyy[/-.]mm[/-.]dd tokens (order-preserving).
    var re = /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/g, m, found = [];
    while ((m = re.exec(s)) !== null) {
        var iso = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
        found.push(iso);
    }
    if (found.length >= 1) out.start = found[0];
    if (found.length >= 2) out.end = found[found.length - 1];
    else if (found.length === 1) out.end = found[0];   // single date → same-day event
    return out;
}

function normalizeFcSpecialEventRecord(raw) {
    var r = raw || {};
    var period = String(r.event_period || r.period || '').trim();
    // Canonical start/end dates: prefer explicit columns; fall back to parsing the legacy free-text period.
    var startCol = String(r.event_start_date || r.start_date || '').trim();
    var endCol = String(r.event_end_date || r.end_date || '').trim();
    var parsed = (!startCol || !endCol) ? _fcParseEventPeriodDates(period) : { start: '', end: '' };
    return {
        // Canonical PK is `event_fc_id` (FC_SUMMARY_SPEC §3.1); fall back to legacy `event_id`/`special_event_id`.
        eventFcId: String(r.event_fc_id || r.event_id || r.special_event_id || '').trim(),
        eventId: String(r.event_fc_id || r.event_id || r.special_event_id || '').trim(),
        // Campaign linkage (2026-07-22 additive) — lets the Growth-Rate assist read a base campaign's FC.
        campaignId: String(r.campaign_id || '').trim(),
        campaignSkuLineId: String(r.campaign_sku_line_id || '').trim(),
        marketplaceId: String(r.marketplace_id || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        scopeType: String(r.scope_type || '').trim().toLowerCase(),
        scopeId: String(r.scope_id || '').trim(),
        sku: String(r.sku || '').trim(),
        series: String(r.series || '').trim(),
        category: String(r.category || '').trim(),
        event: String(r.event || r.event_name || '').trim(),
        eventPeriod: period,
        eventStartDate: startCol || parsed.start,
        eventEndDate: endCol || parsed.end,
        eventMonth: String(r.event_month || r.month || '').trim(),
        year: String(r.year || '').trim(),
        status: String(r.status || '').trim(),
        fcQty: parseFloat(r.fc_qty != null && r.fc_qty !== '' ? r.fc_qty : r.qty) || 0,
        raw: r
    };
}

function normalizeFcTargetRuleRecord(raw) {
    var r = raw || {};
    // Defensive: target-rule column names are not finalized. Read several plausible aliases.
    var pct = r.target_percentage != null && r.target_percentage !== '' ? r.target_percentage
            : (r.target_rate != null && r.target_rate !== '' ? r.target_rate
            : (r.target != null && r.target !== '' ? r.target : r.percentage));
    return {
        ruleId: String(r.target_rule_id || r.rule_id || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        scopeType: String(r.scope_type || r.scope || r.level || '').trim().toLowerCase(),
        scopeId: String(r.scope_id || r.sku || r.series || r.category || '').trim(),
        targetPercentage: (pct != null && pct !== '') ? parseFloat(pct) : null,
        raw: r
    };
}

// ---- Weekly Shipping Plan (Decision Layer) readers ----------------
function normalizeShippingPlanRecord(raw) {
    var r = raw || {};
    return {
        shippingPlanId: String(r.shipping_plan_id || '').trim(),
        shippingPlanNo: String(r.shipping_plan_no || '').trim(),
        planName: String(r.plan_name || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        shipFrom: String(r.ship_from || '').trim(),
        // CANONICAL warehouse endpoints (2026-07-28). source_warehouse_id = out-source identity (NO
        // origin_warehouse_id); destination_warehouse_id = out-destination identity; *_type qualifiers.
        sourceWarehouseId: String(r.source_warehouse_id || '').trim(),
        shipFromType: String(r.ship_from_type || '').trim(),
        destination: String(r.destination || '').trim(),
        destinationWarehouseId: String(r.destination_warehouse_id || '').trim(),
        destinationType: String(r.destination_type || '').trim(),
        shippingMethod: String(r.shipping_method || '').trim(),
        lastMileDelivery: String(r.last_mile_delivery || '').trim(),
        customsType: String(r.customs_type || '').trim(),
        // NON-PERSISTENT view fields (2026-07-28): display text derived from the CODE at read time. The
        // *_label snapshot columns are RETIRED — these are never written back to shipping_plans.
        shippingMethodDisplay: codeDisplay_.shippingMethod(r.shipping_method),
        lastMileDeliveryDisplay: codeDisplay_.lastMileDelivery(r.last_mile_delivery),
        customsTypeDisplay: codeDisplay_.customsType(r.customs_type),
        planVersion: parseFloat(r.plan_version) || 1,
        parentShippingPlanId: String(r.parent_shipping_plan_id || '').trim(),
        submitBatchId: String(r.submit_batch_id || '').trim(),
        batchStatus: String(r.batch_status || '').trim(),
        carrierId: String(r.carrier_id || '').trim(),
        // Rough-quote carrier snapshot (Weekly Plan). carrier_rate_type = the rate card charge_type.
        carrierUnitRate: (r.carrier_unit_rate === '' || r.carrier_unit_rate == null) ? '' : (parseFloat(r.carrier_unit_rate) || 0),
        carrierRateType: String(r.carrier_rate_type || '').trim(),
        importDutyTreatment: String(r.import_duty_treatment || '').trim(),
        estimatedFreightCost: (r.estimated_freight_cost === '' || r.estimated_freight_cost == null) ? '' : (parseFloat(r.estimated_freight_cost) || 0),
        estimatedDuty: (r.estimated_duty === '' || r.estimated_duty == null) ? '' : (parseFloat(r.estimated_duty) || 0),
        estimatedCustomsFee: (r.estimated_customs_fee === '' || r.estimated_customs_fee == null) ? '' : (parseFloat(r.estimated_customs_fee) || 0),
        estimatedTotalCost: (r.estimated_total_cost === '' || r.estimated_total_cost == null) ? '' : (parseFloat(r.estimated_total_cost) || 0),
        currency: String(r.currency || '').trim(),
        status: String(r.status || '').trim(),
        createdBy: String(r.created_by || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        submittedBy: String(r.submitted_by || '').trim(),
        submittedAt: String(r.submitted_at || '').trim(),
        approvedBy: String(r.approved_by || '').trim(),
        approvedAt: String(r.approved_at || '').trim(),
        rejectedBy: String(r.rejected_by || '').trim(),
        rejectedAt: String(r.rejected_at || '').trim(),
        rejectedReason: String(r.rejected_reason || '').trim(),
        rejectedComment: String(r.rejected_comment || '').trim(),
        cancelledBy: String(r.cancelled_by || '').trim(),
        cancelledAt: String(r.cancelled_at || '').trim(),
        // Execution-Layer handoff metadata (set when the plan is converted to a Shipment Draft).
        transferredToShipmentAt: String(r.transferred_to_shipment_at || '').trim(),
        transferredShipmentId: String(r.transferred_shipment_id || '').trim(),
        // Decision Layer Completion (Done) — Decision Layer finished; Execution Layer has taken over.
        completedAt: String(r.completed_at || '').trim(),
        completedBy: String(r.completed_by || '').trim(),
        note: String(r.note || '').trim(),
        source: String(r.source || '').trim(),
        updatedBy: String(r.updated_by || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

function normalizeShippingPlanLineRecord(raw) {
    var r = raw || {};
    return {
        shippingPlanLineId: String(r.shipping_plan_line_id || '').trim(),
        shippingPlanId: String(r.shipping_plan_id || '').trim(),
        sku: String(r.sku || '').trim(),
        // CANONICAL (2026-07-28): each line keeps its REAL marketplace + site SKU (never MULTI on a line).
        siteSku: String(r.site_sku || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        requestedQty: parseFloat(r.requested_qty) || 0,
        approvedQty: parseFloat(r.approved_qty) || 0,
        // CANONICAL plan_carton_qty with legacy carton_qty read-fallback. cartonQty kept as UI alias.
        planCartonQty: parseFloat((r.plan_carton_qty === '' || r.plan_carton_qty == null) ? r.carton_qty : r.plan_carton_qty) || 0,
        cartonQty: parseFloat((r.plan_carton_qty === '' || r.plan_carton_qty == null) ? r.carton_qty : r.plan_carton_qty) || 0,
        unitsPerCarton: parseFloat(r.units_per_carton) || 0,
        sourcePage: String(r.source_page || '').trim(),
        sourceReason: String(r.source_reason || '').trim(),
        inventorySnapshotDate: String(r.inventory_snapshot_date || '').trim(),
        note: String(r.note || '').trim(),
        // Decision Snapshot (per-SKU, immutable after commit)
        snapshotCurrentStock: parseFloat(r.snapshot_current_stock) || 0,
        snapshotAvgSalesPerDay: parseFloat(r.snapshot_avg_sales_per_day) || 0,
        snapshotDaysOfSupply: (r.snapshot_days_of_supply === '' || r.snapshot_days_of_supply == null) ? '' : r.snapshot_days_of_supply,
        snapshotSuggestedQty: parseFloat(r.snapshot_suggested_qty) || 0,
        snapshotTargetDays: parseFloat(r.snapshot_target_days) || 0,
        snapshotFcContext: (r.snapshot_fc_context == null) ? '' : r.snapshot_fc_context,
        snapshotEventContext: (r.snapshot_event_context == null) ? '' : r.snapshot_event_context,
        // Avg-sales provenance snapshots (canonical 2026-07-28).
        snapshotAvgSalesSource: String(r.snapshot_avg_sales_source || '').trim(),
        snapshotNormalDaysCount: (r.snapshot_normal_days_count === '' || r.snapshot_normal_days_count == null) ? '' : (parseFloat(r.snapshot_normal_days_count) || 0),
        snapshotExcludedEventDaysCount: (r.snapshot_excluded_event_days_count === '' || r.snapshot_excluded_event_days_count == null) ? '' : (parseFloat(r.snapshot_excluded_event_days_count) || 0),
        snapshotAvgSalesWarning: String(r.snapshot_avg_sales_warning || '').trim(),
        // Logistics Decision Snapshot (computed at Submit Plan / Save from sku_details carton dims/weights).
        cartonCbm: parseFloat(r.carton_cbm) || 0,
        cbm: parseFloat(r.cbm) || 0,
        grossWeight: parseFloat(r.gross_weight) || 0,
        netWeight: parseFloat(r.net_weight) || 0,
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

// Canonical customs_type enum → localized (中文) Label. Mirror of CUSTOMS_TYPE_LABELS_ in
// 17_carrier_handlers.gs (backend is the source of truth). Used ONLY as a read-side fallback when a
// stored *_label snapshot is blank (legacy rows). Enum names are frozen; only Labels live here.
var CUSTOMS_TYPE_LABELS_ = {
    third_party_customs: '買單報關',
    formal_customs: '正式報關',
    tax_refund_customs: '退稅報關'
};
function customsTypeLabelFallback_(code) {
    var key = String(code == null ? '' : code).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(CUSTOMS_TYPE_LABELS_, key) ? CUSTOMS_TYPE_LABELS_[key] : '';
}

// ============================================================
// Code → Display Resolver (VIEW / Presentation ONLY — 2026-07-28 Canonical Decision).
// The retired *_label snapshot columns (shipping_plans / shipments shipping_method_label, customs_type_label,
// shipments_customs_type_label) are GONE from the transaction DB. Display text is derived at render time from
// the CODE fields (shipping_method / last_mile_delivery / customs_type / shipments_customs_type). These return
// NON-PERSISTENT values and must NEVER be written back to shipping_plans / shipments. Business logic (rate/carrier
// matching, customs/duty, grouping, dedupe) uses the CODE only — never these display strings.
// Display source priority: (1) canonical enum→Label map (customs); (2) a humanized Code fallback. A future
// shared Enum Display Dictionary / Code Dictionary table can extend this without touching callers or the DB.
// ============================================================
function _codeHumanize_(code) {
    var s = String(code == null ? '' : code).trim();
    if (!s) return '';
    return s.split(/[_\s]+/).map(function (w) { return w ? (w.charAt(0).toUpperCase() + w.slice(1)) : w; }).join(' ');
}
var codeDisplay_ = {
    shippingMethod: function (code) { return _codeHumanize_(code); },
    lastMileDelivery: function (code) { return _codeHumanize_(code); },
    customsType: function (code) { return customsTypeLabelFallback_(code) || _codeHumanize_(code); }
};
// Public render-time resolver. carrierName is looked up LIVE from the carriers master (carrier_id →
// carriers.carrier_name) — carrier_name is NEVER stored on shipping_plans / shipments / carrier_rate_cards.
if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.display = {
        shippingMethod: codeDisplay_.shippingMethod,
        lastMileDelivery: codeDisplay_.lastMileDelivery,
        customsType: codeDisplay_.customsType,
        carrierName: function (carrierId) {
            var id = String(carrierId == null ? '' : carrierId).trim();
            if (!id) return '';
            try {
                var db = (window.KM.DB && typeof window.KM.DB.getOperationDb === 'function') ? window.KM.DB.getOperationDb() : null;
                var carriers = (db && (db.carriers || [])) || [];
                for (var i = 0; i < carriers.length; i++) {
                    var c = carriers[i] || {};
                    if (String(c.carrierId || c.carrier_id || '').trim() === id) return String(c.carrierName || c.carrier_name || '').trim();
                }
            } catch (e) { /* carriers not loaded yet → blank */ }
            return '';
        }
    };
}

// Shipment (Execution Layer) header. Execution Snapshot lives on the lines (see below).
function normalizeShipmentRecord(raw) {
    var r = raw || {};
    return {
        shipmentId: String(r.shipment_id || '').trim(),
        shipmentNo: String(r.shipment_no || '').trim(),
        externalShipmentId: String(r.external_shipment_id || '').trim(),
        shippingPlanId: String(r.shipping_plan_id || '').trim(),
        referenceId: String(r.reference_id || '').trim(),
        // CANONICAL warehouse endpoints (2026-07-28). source_warehouse_id = out-source identity (NO
        // origin_warehouse_id). destination_warehouse_id = out-destination identity; legacy warehouse_id
        // (the old destination identity) is the read-fallback. warehouse_code = DESTINATION code snapshot.
        sourceWarehouseId: String(r.source_warehouse_id || '').trim(),
        destinationWarehouseId: String((r.destination_warehouse_id === '' || r.destination_warehouse_id == null) ? (r.warehouse_id || '') : r.destination_warehouse_id).trim(),
        destinationType: String(r.destination_type || '').trim(),
        warehouseId: String(r.warehouse_id || '').trim(),   // legacy (destination) read alias
        warehouseCode: String(r.warehouse_code || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),   // actual, or MULTI when the plan combined marketplaces
        shipFrom: String(r.ship_from || '').trim(),
        destination: String(r.destination || '').trim(),
        carrierId: String(r.carrier_id || '').trim(),
        rateCardId: String(r.rate_card_id || '').trim(),
        importDutyTreatment: String(r.import_duty_treatment || '').trim(),
        masterTrackingNumber: String(r.master_tracking_number || '').trim(),
        isCrossDock: String(r.is_cross_dock || '').trim(),
        temperatureRequirement: String(r.temperature_requirement || '').trim(),
        hazmatFlag: String(r.hazmat_flag || '').trim(),
        shippingMethod: String(r.shipping_method || '').trim(),
        lastMileDelivery: String(r.last_mile_delivery || '').trim(),
        // Customs method SNAPSHOT — CODE. Canonical shipments_customs_type; legacy customs_type read-fallback
        // (historical rows). customsType kept as a temporary read-compat alias = shipmentsCustomsType.
        shipmentsCustomsType: String((r.shipments_customs_type === '' || r.shipments_customs_type == null) ? (r.customs_type || '') : r.shipments_customs_type).trim(),
        customsType: String((r.shipments_customs_type === '' || r.shipments_customs_type == null) ? (r.customs_type || '') : r.shipments_customs_type).trim(),
        // NON-PERSISTENT view fields (2026-07-28): the *_label snapshot columns are RETIRED; display text is
        // derived from the CODE at read time and is NEVER written back to shipments. Documents/Export/UI read
        // these (or call KM.display.* at render) — they must not translate the enum inline elsewhere.
        shippingMethodDisplay: codeDisplay_.shippingMethod(r.shipping_method),
        lastMileDeliveryDisplay: codeDisplay_.lastMileDelivery(r.last_mile_delivery),
        customsTypeDisplay: codeDisplay_.customsType((r.shipments_customs_type === '' || r.shipments_customs_type == null) ? r.customs_type : r.shipments_customs_type),
        status: String(r.status || '').trim(),
        salesOrderId: String(r.sales_order_id || '').trim(),
        bookingNo: String(r.booking_no || '').trim(),
        trackingNumber: String(r.tracking_number || '').trim(),
        containerNo: String(r.container_no || '').trim(),
        blNo: String(r.bl_no || '').trim(),
        invoiceNo: String(r.invoice_no || '').trim(),
        etd: String(r.etd || '').trim(),
        eta: String(r.eta || '').trim(),
        actualDepartureDate: String(r.actual_departure_date || '').trim(),
        actualArrivalDate: String(r.actual_arrival_date || '').trim(),
        customsClearanceDate: String(r.customs_clearance_date || '').trim(),
        deliveredDate: String(r.delivered_date || '').trim(),
        // CANONICAL renamed columns (shipment_total_*) with legacy (total_*) read-fallback for old rows.
        // camelCase shipmentTotal* are canonical; totalQty/totalCartons/totalCbm remain as UI read aliases.
        shipmentTotalQty: parseFloat((r.shipment_total_qty === '' || r.shipment_total_qty == null) ? r.total_qty : r.shipment_total_qty) || 0,
        shipmentTotalCartons: parseFloat((r.shipment_total_cartons === '' || r.shipment_total_cartons == null) ? r.total_cartons : r.shipment_total_cartons) || 0,
        shipmentTotalCbm: (function () { var v = (r.shipment_total_cbm === '' || r.shipment_total_cbm == null) ? r.total_cbm : r.shipment_total_cbm; return (v === '' || v == null) ? '' : (parseFloat(v) || 0); })(),
        totalQty: parseFloat((r.shipment_total_qty === '' || r.shipment_total_qty == null) ? r.total_qty : r.shipment_total_qty) || 0,
        totalCartons: parseFloat((r.shipment_total_cartons === '' || r.shipment_total_cartons == null) ? r.total_cartons : r.shipment_total_cartons) || 0,
        totalCbm: (function () { var v = (r.shipment_total_cbm === '' || r.shipment_total_cbm == null) ? r.total_cbm : r.shipment_total_cbm; return (v === '' || v == null) ? '' : (parseFloat(v) || 0); })(),
        // CANONICAL shipment_total_gross/net_weight with legacy total_* read-fallback; totalGross/NetWeight kept as UI aliases.
        shipmentTotalGrossWeight: (function () { var v = (r.shipment_total_gross_weight === '' || r.shipment_total_gross_weight == null) ? r.total_gross_weight : r.shipment_total_gross_weight; return (v === '' || v == null) ? '' : (parseFloat(v) || 0); })(),
        shipmentTotalNetWeight: (function () { var v = (r.shipment_total_net_weight === '' || r.shipment_total_net_weight == null) ? r.total_net_weight : r.shipment_total_net_weight; return (v === '' || v == null) ? '' : (parseFloat(v) || 0); })(),
        totalGrossWeight: (function () { var v = (r.shipment_total_gross_weight === '' || r.shipment_total_gross_weight == null) ? r.total_gross_weight : r.shipment_total_gross_weight; return (v === '' || v == null) ? '' : (parseFloat(v) || 0); })(),
        totalNetWeight: (function () { var v = (r.shipment_total_net_weight === '' || r.shipment_total_net_weight == null) ? r.total_net_weight : r.shipment_total_net_weight; return (v === '' || v == null) ? '' : (parseFloat(v) || 0); })(),
        // Phase-1 Estimated Cost (exact on the shipment; blank = Not Applied / Rate Review — never 0).
        estimatedFreightCost: (r.estimated_freight_cost === '' || r.estimated_freight_cost == null) ? '' : (parseFloat(r.estimated_freight_cost) || 0),
        estimatedDuty: (r.estimated_duty === '' || r.estimated_duty == null) ? '' : (parseFloat(r.estimated_duty) || 0),
        estimatedCustomsFee: (r.estimated_customs_fee === '' || r.estimated_customs_fee == null) ? '' : (parseFloat(r.estimated_customs_fee) || 0),
        estimatedTotalCost: (r.estimated_total_cost === '' || r.estimated_total_cost == null) ? '' : (parseFloat(r.estimated_total_cost) || 0),
        estimatedUnitCost: (r.estimated_unit_cost === '' || r.estimated_unit_cost == null) ? '' : (parseFloat(r.estimated_unit_cost) || 0),
        freightCostActual: (r.freight_cost_actual === '' || r.freight_cost_actual == null) ? '' : (parseFloat(r.freight_cost_actual) || 0),
        dutyActual: (r.duty_actual === '' || r.duty_actual == null) ? '' : (parseFloat(r.duty_actual) || 0),
        totalCostActual: (r.total_cost_actual === '' || r.total_cost_actual == null) ? '' : (parseFloat(r.total_cost_actual) || 0),
        currency: String(r.currency || '').trim(),
        // Ship / Done (Shipment Draft workspace) lifecycle metadata.
        shippedAt: String(r.shipped_at || '').trim(),
        shippedBy: String(r.shipped_by || '').trim(),
        hiddenFromDraftAt: String(r.hidden_from_draft_at || '').trim(),
        hiddenFromDraftBy: String(r.hidden_from_draft_by || '').trim(),
        note: String(r.note || '').trim(),
        createdBy: String(r.created_by || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedBy: String(r.updated_by || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

// Shipment line. snapshot_* fields are the Execution Snapshot — a verbatim copy of the Decision
// Snapshot (immutable; never recalculated in the Execution Layer).
function normalizeShipmentLineRecord(raw) {
    var r = raw || {};
    return {
        shipmentLineId: String(r.shipment_line_id || '').trim(),
        shipmentId: String(r.shipment_id || '').trim(),
        sku: String(r.sku || '').trim(),
        // CANONICAL shipment_qty with legacy qty read-fallback. qty kept as UI alias.
        shipmentQty: parseFloat((r.shipment_qty === '' || r.shipment_qty == null) ? r.qty : r.shipment_qty) || 0,
        qty: parseFloat((r.shipment_qty === '' || r.shipment_qty == null) ? r.qty : r.shipment_qty) || 0,
        factoryStockAllocationQty: (r.factory_stock_allocation_qty === '' || r.factory_stock_allocation_qty == null) ? '' : (parseFloat(r.factory_stock_allocation_qty) || 0),
        // Receipt authority (F1-SHIPMENT-RECEIPT-R1B). shipment_received_qty = CUMULATIVE physically-received
        // qty (live DB column; blank/null historical rows normalize to 0). remainingQty is runtime-derived
        // = max(shipmentQty - received, 0) and is NEVER persisted. shipment_qty stays immutable.
        shipmentReceivedQty: (r.shipment_received_qty === '' || r.shipment_received_qty == null) ? 0 : (parseFloat(r.shipment_received_qty) || 0),
        remainingQty: (function () {
            var shipped = parseFloat((r.shipment_qty === '' || r.shipment_qty == null) ? r.qty : r.shipment_qty) || 0;
            var recv = (r.shipment_received_qty === '' || r.shipment_received_qty == null) ? 0 : (parseFloat(r.shipment_received_qty) || 0);
            return Math.max(shipped - recv, 0);
        })(),
        // CANONICAL shipment_carton_qty with legacy carton_qty read-fallback. cartonQty kept as UI alias.
        shipmentCartonQty: parseFloat((r.shipment_carton_qty === '' || r.shipment_carton_qty == null) ? r.carton_qty : r.shipment_carton_qty) || 0,
        cartonQty: parseFloat((r.shipment_carton_qty === '' || r.shipment_carton_qty == null) ? r.carton_qty : r.shipment_carton_qty) || 0,
        cartonNoStart: String(r.carton_no_start || '').trim(),
        cartonNoEnd: String(r.carton_no_end || '').trim(),
        unitsPerCarton: parseFloat(r.units_per_carton) || 0,
        // LINE-TOTAL CBM. Canonical shipment_carton_cbm; legacy per-carton carton_cbm read-fallback
        // (historical rows only). cartonCbm / cbm are frontend read-compat aliases = the same line-total
        // value; outbound writes must use shipment_carton_cbm. NEVER multiplied by cartons in the frontend.
        shipmentCartonCbm: (function () { var v = (r.shipment_carton_cbm === '' || r.shipment_carton_cbm == null) ? r.carton_cbm : r.shipment_carton_cbm; return (v === '' || v == null) ? '' : (parseFloat(v) || 0); })(),
        cartonCbm: (function () { var v = (r.shipment_carton_cbm === '' || r.shipment_carton_cbm == null) ? r.carton_cbm : r.shipment_carton_cbm; return (v === '' || v == null) ? '' : (parseFloat(v) || 0); })(),
        cbm: (function () { var v = (r.shipment_carton_cbm === '' || r.shipment_carton_cbm == null) ? r.carton_cbm : r.shipment_carton_cbm; return (v === '' || v == null) ? '' : (parseFloat(v) || 0); })(),
        grossWeight: (r.gross_weight === '' || r.gross_weight == null) ? '' : (parseFloat(r.gross_weight) || 0),
        netWeight: (r.net_weight === '' || r.net_weight == null) ? '' : (parseFloat(r.net_weight) || 0),
        purchaseOrderLineId: String(r.purchase_order_line_id || '').trim(),
        // R6 — FROZEN receiver lineage (blank on historical rows → merged stays fail-closed/MULTI).
        shippingPlanLineId: String(r.shipping_plan_line_id || '').trim(),
        note: String(r.note || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        // Execution Snapshot (copied from the Decision Snapshot; immutable)
        snapshotCurrentStock: parseFloat(r.snapshot_current_stock) || 0,
        snapshotAvgSalesPerDay: parseFloat(r.snapshot_avg_sales_per_day) || 0,
        snapshotDaysOfSupply: (r.snapshot_days_of_supply === '' || r.snapshot_days_of_supply == null) ? '' : r.snapshot_days_of_supply,
        snapshotSuggestedQty: parseFloat(r.snapshot_suggested_qty) || 0,
        snapshotTargetDays: parseFloat(r.snapshot_target_days) || 0,
        snapshotFcContext: (r.snapshot_fc_context == null) ? '' : r.snapshot_fc_context,
        snapshotEventContext: (r.snapshot_event_context == null) ? '' : r.snapshot_event_context,
        snapshotAvgSalesSource: String(r.snapshot_avg_sales_source || '').trim(),
        snapshotAvgSalesWarning: String(r.snapshot_avg_sales_warning || '').trim(),
        raw: r
    };
}

// ========================================
// Procurement Layer (Phase 1) normalizers
// request_orders / request_order_lines / purchase_orders / purchase_order_lines.
// See REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md + DATABASE_RELATIONSHIP_MAP.md §7.
// ========================================

// Request Order (Procurement Planning Draft) header.
function normalizeRequestOrderRecord(raw) {
    var r = raw || {};
    return {
        requestOrderId: String(r.request_order_id || '').trim(),
        requestOrderNo: String(r.request_order_no || '').trim(),
        requestOrderVersion: parseFloat(r.request_order_version) || 1,
        parentRequestOrderId: String(r.parent_request_order_id || '').trim(),
        company: String(r.company || '').trim(),
        supplierId: String(r.supplier_id || '').trim(),
        supplierName: String(r.supplier_name || '').trim(),
        factoryId: String(r.factory_id || '').trim(),
        warehouseId: String(r.warehouse_id || '').trim(),
        // Canonical status = request_status; fall back to legacy `status` for back-compat only.
        requestStatus: String(r.request_status || r.status || '').trim(),
        status: String(r.request_status || r.status || '').trim(),
        tierGroup: String(r.tier_group || '').trim(),
        totalSku: parseFloat(r.total_sku) || 0,
        totalQty: parseFloat(r.total_qty) || 0,
        totalCartons: parseFloat(r.total_cartons) || 0,
        estimatedAmount: (r.estimated_amount === '' || r.estimated_amount == null) ? '' : (parseFloat(r.estimated_amount) || 0),
        currency: String(r.currency || '').trim(),
        source: String(r.source || '').trim(),
        sourceRefType: String(r.source_ref_type || '').trim(),
        sourceRefId: String(r.source_ref_id || '').trim(),
        createdBy: String(r.created_by || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        submittedBy: String(r.submitted_by || '').trim(),
        submittedAt: String(r.submitted_at || '').trim(),
        approvedBy: String(r.approved_by || '').trim(),
        approvedAt: String(r.approved_at || '').trim(),
        rejectedBy: String(r.rejected_by || '').trim(),
        rejectedAt: String(r.rejected_at || '').trim(),
        rejectedReason: String(r.rejected_reason || '').trim(),
        cancelledBy: String(r.cancelled_by || '').trim(),
        cancelledAt: String(r.cancelled_at || '').trim(),
        completedBy: String(r.completed_by || '').trim(),
        completedAt: String(r.completed_at || '').trim(),
        note: String(r.note || '').trim(),
        updatedBy: String(r.updated_by || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

function normalizeRequestOrderLineRecord(raw) {
    var r = raw || {};
    return {
        requestOrderLineId: String(r.request_order_line_id || '').trim(),
        requestOrderId: String(r.request_order_id || '').trim(),
        sku: String(r.sku || '').trim(),
        series: String(r.series || '').trim(),
        company: String(r.company || '').trim(),
        requestBucket: String(r.request_bucket || '').trim(),   // canonical T1/T2/T3 (tier_type deprecated)
        requestMonth: String(r.request_month || '').trim(),
        inspectionDate: String(r.inspection_date || '').trim(),
        expectedReadyDate: String(r.expected_ready_date || '').trim(),
        expectedShipDate: String(r.expected_ship_date || '').trim(),
        requestedQty: parseFloat(r.requested_qty) || 0,
        approvedQty: parseFloat(r.approved_qty) || 0,
        // Per-company allocation (primary). matched company = qty, others 0.
        kmQty: parseFloat(r.km_qty) || 0,
        resusQty: parseFloat(r.resus_qty) || 0,
        restwQty: parseFloat(r.restw_qty) || 0,
        unitsPerCarton: parseFloat(r.units_per_carton) || 0,
        cartonQty: parseFloat(r.carton_qty) || 0,
        shortageQty: (r.shortage_qty === '' || r.shortage_qty == null) ? '' : (parseFloat(r.shortage_qty) || 0),
        calculationMethod: String(r.calculation_method || '').trim(),
        lineStatus: String(r.line_status || '').trim(),
        // Canonical purchase_order_line_id (traceability); falls back to legacy linked_purchase_order_line_id for old rows.
        purchaseOrderLineId: String(r.purchase_order_line_id || r.linked_purchase_order_line_id || '').trim(),
        supplierId: String(r.supplier_id || '').trim(),
        supplierName: String(r.supplier_name || '').trim(),
        supplierSku: String(r.supplier_sku || '').trim(),
        unitCost: (r.unit_cost === '' || r.unit_cost == null) ? '' : (parseFloat(r.unit_cost) || 0),
        estimatedAmount: (r.estimated_amount === '' || r.estimated_amount == null) ? '' : (parseFloat(r.estimated_amount) || 0),
        currency: String(r.currency || '').trim(),
        note: String(r.note || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        // Deprecated columns (read-only back-compat; no longer written / primary).
        productName: String(r.product_name || '').trim(),
        finalOrderQty: (r.final_order_qty === '' || r.final_order_qty == null) ? '' : (parseFloat(r.final_order_qty) || 0),
        raw: r
    };
}

// Purchase Order (Procurement Commitment) header.
function normalizePurchaseOrderRecord(raw) {
    var r = raw || {};
    // Canonical order_status (falls back to legacy `status` for old rows).
    var orderStatus = String(r.order_status || r.status || '').trim();
    // Canonical supplier timeline (falls back to legacy expected_ready_date / confirmed_ready_date).
    var supplierExpectedReady = String(r.supplier_expected_ready_date || r.expected_ready_date || '').trim();
    var supplierConfirmedReady = String(r.supplier_confirmed_ready_date || r.confirmed_ready_date || '').trim();
    var expectedCompletion = String(r.expected_completion_date || supplierExpectedReady || '').trim();
    var poNo = String(r.po_no || r.purchase_order_no || '').trim();
    return {
        purchaseOrderId: String(r.purchase_order_id || '').trim(),
        poNo: poNo,
        kmPoNo: String(r.km_po_no || '').trim(),
        purchaseOrderNo: String(r.purchase_order_no || r.po_no || '').trim(),
        poVersion: parseFloat(r.po_version) || 1,
        parentPurchaseOrderId: String(r.parent_purchase_order_id || '').trim(),
        requestOrderId: String(r.request_order_id || '').trim(),
        requestBucket: String(r.request_bucket || '').trim(),   // T1 or T2_T3
        company: String(r.company || '').trim(),
        supplierId: String(r.supplier_id || '').trim(),
        supplierName: String(r.supplier_name || '').trim(),
        factoryId: String(r.factory_id || '').trim(),
        warehouseId: String(r.warehouse_id || '').trim(),
        // order_status is canonical; `status` kept as a back-compat alias (same value) for existing UI.
        orderStatus: orderStatus,
        status: orderStatus,
        orderDate: String(r.order_date || '').trim(),
        currency: String(r.currency || '').trim(),
        totalSku: parseFloat(r.total_sku) || 0,
        totalQty: parseFloat(r.total_qty) || 0,
        totalAmount: (r.total_amount === '' || r.total_amount == null) ? '' : (parseFloat(r.total_amount) || 0),
        subtotalAmount: (r.subtotal_amount === '' || r.subtotal_amount == null) ? '' : (parseFloat(r.subtotal_amount) || 0),
        depositAmount: (r.deposit_amount === '' || r.deposit_amount == null) ? '' : (parseFloat(r.deposit_amount) || 0),
        balanceAmount: (r.balance_amount === '' || r.balance_amount == null) ? '' : (parseFloat(r.balance_amount) || 0),
        paidAmount: (r.paid_amount === '' || r.paid_amount == null) ? '' : (parseFloat(r.paid_amount) || 0),
        paymentStatus: String(r.payment_status || '').trim(),
        paymentTermId: String(r.payment_term_id || '').trim(),
        inspectionDate: String(r.inspection_date || '').trim(),
        expectedCompletionDate: expectedCompletion,
        expectedShipDate: String(r.expected_ship_date || '').trim(),
        depositDueDate: String(r.deposit_due_date || '').trim(),   // = order_date + 5 business days (stamped at Send PO)
        supplierExpectedReadyDate: supplierExpectedReady,
        supplierConfirmedReadyDate: supplierConfirmedReady,
        // Back-compat alias for existing UI (Expected Ready) — mirrors supplier_expected_ready_date.
        expectedReadyDate: supplierExpectedReady,
        confirmedReadyDate: supplierConfirmedReady,
        issuedBy: String(r.issued_by || '').trim(),
        issuedAt: String(r.issued_at || '').trim(),
        confirmedBy: String(r.confirmed_by || '').trim(),
        confirmedAt: String(r.confirmed_at || '').trim(),
        cancelledBy: String(r.cancelled_by || '').trim(),
        cancelledAt: String(r.cancelled_at || '').trim(),
        completedBy: String(r.completed_by || '').trim(),
        completedAt: String(r.completed_at || '').trim(),
        // Closure (auto when all lines remaining_qty=0, or manual with a reason).
        closureReason: String(r.closure_reason || '').trim(),
        closedBy: String(r.closed_by || '').trim(),
        closedAt: String(r.closed_at || '').trim(),
        note: String(r.note || '').trim(),
        createdBy: String(r.created_by || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedBy: String(r.updated_by || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

function normalizePurchaseOrderLineRecord(raw) {
    var r = raw || {};
    return {
        purchaseOrderLineId: String(r.purchase_order_line_id || '').trim(),
        purchaseOrderId: String(r.purchase_order_id || '').trim(),
        requestOrderLineId: String(r.request_order_line_id || '').trim(),
        requestOrderId: String(r.request_order_id || '').trim(),
        requestBucket: String(r.request_bucket || '').trim(),   // original T1 / T2 / T3
        sku: String(r.sku || '').trim(),
        company: String(r.company || '').trim(),
        // product_name is DEPRECATED on purchase_order_lines; kept as a back-compat alias (blank for v2 lines;
        // product display should join sku_details for labels). Runtime must not depend on it.
        productName: String(r.product_name || '').trim(),
        series: String(r.series || '').trim(),
        factoryItemNo: String(r.factory_item_no || '').trim(),
        factoryItemName: String(r.factory_item_name || '').trim(),
        // Company allocation snapshot (mandatory in PO v2).
        kmQty: parseFloat(r.km_qty) || 0,
        resusQty: parseFloat(r.resus_qty) || 0,
        restwQty: parseFloat(r.restw_qty) || 0,
        recommendedQty: (r.recommended_qty === '' || r.recommended_qty == null) ? '' : (parseFloat(r.recommended_qty) || 0),
        requestedQty: parseFloat(r.requested_qty) || 0,
        approvedQty: parseFloat(r.approved_qty) || 0,
        orderedQty: parseFloat(r.ordered_qty) || 0,
        completedQty: parseFloat(r.completed_qty) || 0,
        shippedQty: parseFloat(r.shipped_qty) || 0,
        remainingQty: (r.remaining_qty === '' || r.remaining_qty == null) ? '' : (parseFloat(r.remaining_qty) || 0),
        unitsPerCarton: parseFloat(r.units_per_carton) || 0,
        cartonQty: parseFloat(r.carton_qty) || 0,
        supplierId: String(r.supplier_id || '').trim(),
        supplierName: String(r.supplier_name || '').trim(),
        supplierSku: String(r.supplier_sku || '').trim(),
        supplierWarehouseId: String(r.supplier_warehouse_id || '').trim(),
        unitCost: (r.unit_cost === '' || r.unit_cost == null) ? '' : (parseFloat(r.unit_cost) || 0),
        lineAmount: (r.line_amount === '' || r.line_amount == null) ? '' : (parseFloat(r.line_amount) || 0),
        currency: String(r.currency || '').trim(),
        lineStatus: String(r.line_status || '').trim(),
        inspectionDate: String(r.inspection_date || '').trim(),
        expectedCompletionDate: String(r.expected_completion_date || '').trim(),
        expectedShipDate: String(r.expected_ship_date || '').trim(),
        relatedShipmentId: String(r.related_shipment_id || '').trim(),
        note: String(r.note || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

// supplier_price_list — v1 lead-time / cost detail layer. IMPORT/MASTER table; [] when the payload
// lacks it (missing-source safe). `suppliers` master table is future (see REQUEST_ORDER spec §12.6).
function normalizeSupplierPriceListRecord(raw) {
    var r = raw || {};
    return {
        supplierPriceId: String(r.supplier_price_id || r.price_id || '').trim(),
        supplierId: String(r.supplier_id || '').trim(),
        supplierName: String(r.supplier_name || r.supplier_name_snapshot || '').trim(),
        supplierWarehouseId: String(r.supplier_warehouse_id || '').trim(),
        sku: String(r.sku || '').trim(),
        supplierSku: String(r.supplier_sku || '').trim(),
        unitCost: (r.unit_cost === '' || r.unit_cost == null) ? '' : (parseFloat(r.unit_cost) || 0),
        currency: String(r.currency || '').trim(),
        leadTimeDays: (r.lead_time_days === '' || r.lead_time_days == null) ? '' : (parseFloat(r.lead_time_days) || 0),
        moq: (r.moq === '' || r.moq == null) ? '' : (parseFloat(r.moq) || 0),
        isActive: String(r.is_active == null ? '' : r.is_active).trim(),
        effectiveFrom: String(r.effective_from || '').trim(),
        effectiveTo: String(r.effective_to || '').trim(),
        note: String(r.note || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

// ========================================
// Global Logistics Map read models (READ-ONLY; additive 2026-07-23).
// logistics_locations = physical-place master (canonical coordinates); shipment_route_templates +
// _nodes = owner-maintained route reference; shipment_events = runtime evidence. All normalize to []
// when the payload lacks the tab (missing-tab safe). No writer / no mutation is added here.
// ========================================

// Parse a coordinate cell to a Number ONLY when it is a real, in-range value; otherwise null.
// Blank / non-numeric / out-of-range → null (never coerced to 0 — 0,0 is treated as not-a-coordinate).
function _geoNum(v, kind) {
    if (v === '' || v == null) return null;
    var n = parseFloat(v);
    if (!isFinite(n)) return null;
    if (kind === 'lat' && (n < -90 || n > 90)) return null;
    if (kind === 'lng' && (n < -180 || n > 180)) return null;
    return n;
}

function normalizeLogisticsLocationRecord(raw) {
    var r = raw || {};
    return {
        logisticsLocationId: String(r.logistics_location_id || '').trim(),
        locationCode: String(r.location_code || '').trim(),
        locationName: String(r.location_name || '').trim(),
        localName: String(r.local_name || '').trim(),
        locationType: String(r.location_type || '').trim(),
        country: String(r.country || '').trim(),
        subdivisionCode: String(r.subdivision_code || '').trim(),
        region: String(r.region || '').trim(),
        city: String(r.city || '').trim(),
        district: String(r.district || '').trim(),
        addressLine1: String(r.address_line_1 || '').trim(),
        addressLine2: String(r.address_line_2 || '').trim(),
        postalCode: String(r.postal_code || '').trim(),
        latitude: _geoNum(r.latitude, 'lat'),
        longitude: _geoNum(r.longitude, 'lng'),
        coordinateAccuracy: String(r.coordinate_accuracy || '').trim(),
        coordinateSourceType: String(r.coordinate_source_type || '').trim(),
        coordinateSourceReference: String(r.coordinate_source_reference || '').trim(),
        coordinateVerifiedAt: String(r.coordinate_verified_at || '').trim(),
        coordinateVerifiedBy: String(r.coordinate_verified_by || '').trim(),
        verificationStatus: String(r.verification_status || '').trim(),
        recordStatus: String(r.record_status || r.coordinate_status || '').trim(),
        unLocode: String(r.un_locode || '').trim(),
        iataCode: String(r.iata_code || '').trim(),
        icaoCode: String(r.icao_code || '').trim(),
        portCode: String(r.port_code || '').trim(),
        railTerminalCode: String(r.rail_terminal_code || '').trim(),
        warehouseId: String(r.warehouse_id || '').trim(),
        factoryId: String(r.factory_id || '').trim(),
        timezone: String(r.timezone || '').trim(),
        mapLabelPriority: parseInt(r.map_label_priority, 10) || 0,
        isActive: _whBool(r.is_active),
        note: String(r.note || '').trim(),
        raw: r
    };
}

// shipment_route_templates — owner-maintained; READ-ONLY (never modified by this page).
function normalizeShipmentRouteTemplateRecord(raw) {
    var r = raw || {};
    return {
        routeTemplateId: String(r.route_template_id || '').trim(),
        routeTemplateName: String(r.route_template_name || '').trim(),
        routeVersion: String(r.route_version || '').trim(),
        originCountry: String(r.origin_country || '').trim(),
        originWarehouseId: String(r.origin_warehouse_id || '').trim(),
        destinationCountry: String(r.destination_country || '').trim(),
        destinationRegion: String(r.destination_region || '').trim(),
        destinationWarehouseId: String(r.destination_warehouse_id || '').trim(),
        carrierId: String(r.carrier_id || '').trim(),
        transitType: String(r.transit_type || '').trim(),
        lastMileDelivery: String(r.last_mile_delivery || '').trim(),
        customsType: String(r.customs_type || '').trim(),
        priority: parseInt(r.priority, 10) || 0,
        isActive: _whBool(r.is_active),
        effectiveFrom: String(r.effective_from || '').trim(),
        effectiveTo: String(r.effective_to || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

// shipment_route_template_nodes — owner-maintained; READ-ONLY. logistics_location_id /
// location_resolution_type / location_ref_* are read DEFENSIVELY (present only after the additive
// Runtime-Mapping-Sync columns are applied; blank until then).
function normalizeShipmentRouteTemplateNodeRecord(raw) {
    var r = raw || {};
    return {
        routeTemplateNodeId: String(r.route_template_node_id || '').trim(),
        routeTemplateId: String(r.route_template_id || '').trim(),
        nodeSequence: parseInt(r.node_sequence, 10) || 0,
        nodeType: String(r.node_type || '').trim(),
        nodeCode: String(r.node_code || '').trim(),
        nodeName: String(r.node_name || '').trim(),
        country: String(r.country || '').trim(),
        region: String(r.region || '').trim(),
        city: String(r.city || '').trim(),
        latitude: _geoNum(r.latitude, 'lat'),
        longitude: _geoNum(r.longitude, 'lng'),
        plannedEventType: String(r.planned_event_type || '').trim(),
        defaultOffsetDays: (r.default_offset_days === '' || r.default_offset_days == null) ? null : (parseFloat(r.default_offset_days) || 0),
        transportModeToNext: String(r.transport_mode_to_next || '').trim(),
        isDestinationPlaceholder: _whBool(r.is_destination_placeholder),
        isRequired: _whBool(r.is_required),
        logisticsLocationId: String(r.logistics_location_id || '').trim(),
        locationResolutionType: String(r.location_resolution_type || '').trim(),
        locationRefType: String(r.location_ref_type || '').trim(),
        locationRefId: String(r.location_ref_id || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

// shipment_events — runtime evidence (append-only ledger). READ-ONLY here; spec-only runtime.
function normalizeShipmentEventRecord(raw) {
    var r = raw || {};
    return {
        shipmentEventId: String(r.shipment_event_id || '').trim(),
        shipmentId: String(r.shipment_id || '').trim(),
        shipmentRouteId: String(r.shipment_route_id || '').trim(),
        eventSequence: parseInt(r.event_sequence, 10) || 0,
        eventTime: String(r.event_time || '').trim(),
        eventType: String(r.event_type || '').trim(),
        eventStatus: String(r.event_status || '').trim(),
        locationName: String(r.location_name || '').trim(),
        country: String(r.country || '').trim(),
        city: String(r.city || '').trim(),
        latitude: _geoNum(r.latitude, 'lat'),
        longitude: _geoNum(r.longitude, 'lng'),
        source: String(r.source || '').trim(),
        sourceEventId: String(r.source_event_id || '').trim(),
        rawStatus: String(r.raw_status || '').trim(),
        logisticsLocationId: String(r.logistics_location_id || '').trim(),
        note: String(r.note || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        raw: r
    };
}

// shipment_routes (RUNTIME) — one row per Shipment Route NODE (canonical live schema; there is NO
// separate route-header table and NO shipment_route_node_id — see the 2026-07-24 schema audit). Grouped
// by shipment_id + ordered by sequence_no. READ-ONLY; spec-only runtime (no writer here).
function normalizeShipmentRouteRecord(raw) {
    var r = raw || {};
    return {
        shipmentRouteId: String(r.shipment_route_id || '').trim(),
        shipmentId: String(r.shipment_id || '').trim(),
        routeTemplateId: String(r.route_template_id || '').trim(),
        routeTemplateNodeId: String(r.route_template_node_id || '').trim(),
        sequenceNo: parseInt(r.sequence_no, 10) || 0,
        nodeType: String(r.node_type || '').trim(),
        nodeCode: String(r.node_code || '').trim(),
        locationRefType: String(r.location_ref_type || '').trim(),
        locationRefId: String(r.location_ref_id || '').trim(),
        locationName: String(r.location_name || '').trim(),
        country: String(r.country || '').trim(),
        region: String(r.region || '').trim(),
        city: String(r.city || '').trim(),
        latitude: _geoNum(r.latitude, 'lat'),
        longitude: _geoNum(r.longitude, 'lng'),
        transportMode: String(r.transport_mode || '').trim(),
        plannedEventType: String(r.planned_event_type || '').trim(),
        plannedArrivalDate: String(r.planned_arrival_date || '').trim(),
        plannedDepartureDate: String(r.planned_departure_date || '').trim(),
        actualArrivalDate: String(r.actual_arrival_date || '').trim(),
        actualDepartureDate: String(r.actual_departure_date || '').trim(),
        status: String(r.status || '').trim(),
        raw: r
    };
}

function normalizeOperationDb(rawDb) {
    var db = rawDb || {};
    return {
        // supplier_price_list — [] when the tab is absent from the payload (Lead Time then shows '--').
        supplierPriceList: (db.supplier_price_list || []).map(normalizeSupplierPriceListRecord).filter(function(r) { return r.sku; }),
        skuDetails: (db.sku_details || []).map(normalizeSkuDetailsRecord).filter(function(r) { return r.sku; }),
        productFeatures: (db.product_features || []).map(normalizeProductFeatureRecord),
        skuHandbookSummaries: (db.sku_handbook_summaries || []).map(normalizeSkuHandbookSummaryRecord),
        campaigns: (db.campaigns || []).map(normalizeCampaignRecord).filter(function(r) { return r.campaignId; }),
        campaignSkuLines: (db.campaign_sku_lines || []).map(normalizeCampaignSkuLineRecord).filter(function(r) { return r.campaignSkuLineId; }),
        marketplaces: (db.marketplaces || []).map(normalizeMarketplaceRecord).filter(function(r) { return r.marketplaceId || r.marketplace; }),
        marketplaceSkus: (db.marketplace_skus || []).map(normalizeMarketplaceSkuRecord).filter(function(r) { return r.sku; }),
        pricingList: (db.pricing_list || []).map(normalizePricingListRecord).filter(function(r) { return r.pricingId || r.marketplaceSkuId || r.sku; }),
        pricingChangeLog: (db.pricing_change_log || []).map(normalizePricingChangeLogRecord).filter(function(r) { return r.logId || r.pricingId; }),
        fcRegularForecast: (db.fc_regular_forecast || []).map(normalizeFcRegularForecastRecord).filter(function(r) { return r.forecastId || r.sku; }),
        // Phase-1 multi-warehouse demand-allocation config (F1-4B-E). [] when the tab is absent (missing-source safe).
        replenishmentDemandAllocationRules: (db.replenishment_demand_allocation_rules || []).map(normalizeReplenishmentDemandAllocationRuleRecord).filter(function(r) { return r.allocationRuleId || (r.destinationWarehouseId && r.marketplace); }),
        factoryStock: (db.factory_stock || []).map(normalizeFactoryStockRecord).filter(function(r) { return r.factoryStockId || r.sku; }),
        factoryStockMovements: (db.factory_stock_movements || []).map(normalizeFactoryStockMovementRecord).filter(function(r) { return r.movementId || r.sku; }),
        warehouses: (db.warehouses || []).map(normalizeWarehouseRecord).filter(function(r) { return r.warehouseId || r.warehouseName; }),
        overseasInventorySnapshot: (db.overseas_inventory_snapshot || []).map(normalizeOverseasInventorySnapshotRecord).filter(function(r) { return r.warehouseId && r.sku; }),
        overseasInventoryMovements: (db.overseas_inventory_movements || []).map(normalizeOverseasInventoryMovementRecord).filter(function(r) { return r.movementId || r.warehouseId; }),
        // Amazon snapshot + forecast-event source tables (import-only; [] when payload lacks them).
        amazonInventorySnapshot: (db.amazon_inventory_snapshot || []).map(normalizeAmazonInventorySnapshotRecord).filter(function(r) { return r.sku; }),
        amazonInventoryHealthSnapshot: (db.amazon_inventory_health_snapshot || []).map(normalizeAmazonInventoryHealthSnapshotRecord).filter(function(r) { return r.sku; }),
        amazonDailySalesSnapshot: (db.amazon_daily_sales_snapshot || []).map(normalizeAmazonDailySalesSnapshotRecord).filter(function(r) { return r.sku; }),
        amazonWeeklySalesSnapshot: (db.amazon_weekly_sales_snapshot || []).map(normalizeAmazonWeeklySalesSnapshotRecord).filter(function(r) { return r.sku; }),
        fcSpecialEvents: (db.fc_special_events || []).map(normalizeFcSpecialEventRecord).filter(function(r) { return r.event || r.sku || r.scopeId; }),
        fcTargetRules: (db.fc_target_rules || []).map(normalizeFcTargetRuleRecord).filter(function(r) { return r.scopeId || r.ruleId; }),
        shippingPlans: (db.shipping_plans || []).map(normalizeShippingPlanRecord).filter(function(r) { return r.shippingPlanId; }),
        shippingPlanLines: (db.shipping_plan_lines || []).map(normalizeShippingPlanLineRecord).filter(function(r) { return r.shippingPlanLineId || r.shippingPlanId; }),
        shipments: (db.shipments || []).map(normalizeShipmentRecord).filter(function(r) { return r.shipmentId; }),
        shipmentLines: (db.shipment_lines || []).map(normalizeShipmentLineRecord).filter(function(r) { return r.shipmentLineId || r.shipmentId; }),
        // Global Logistics Map read models (READ-ONLY; [] when the payload lacks the tab). Filters are
        // LENIENT — keep any row carrying an identifying / name / coordinate field so a single mismatched
        // PK column name cannot silently drop the whole dataset. window._opDbDiag records raw-vs-kept counts
        // + the raw column keys so a full column-name mismatch is diagnosable from runtime evidence.
        logisticsLocations: (db.logistics_locations || []).map(normalizeLogisticsLocationRecord).filter(function(r) { return r.logisticsLocationId || r.locationCode || r.locationName || r.warehouseId || r.factoryId || r.latitude !== null; }),
        shipmentRouteTemplates: (db.shipment_route_templates || []).map(normalizeShipmentRouteTemplateRecord).filter(function(r) { return r.routeTemplateId || r.routeTemplateName || r.destinationCountry || r.originCountry; }),
        shipmentRouteTemplateNodes: (db.shipment_route_template_nodes || []).map(normalizeShipmentRouteTemplateNodeRecord).filter(function(r) { return r.routeTemplateNodeId || r.routeTemplateId || r.nodeName || r.nodeCode || r.latitude !== null; }),
        shipmentRoutes: (db.shipment_routes || []).map(normalizeShipmentRouteRecord).filter(function(r) { return r.shipmentRouteId || r.shipmentId || r.locationName || r.latitude !== null; }),
        shipmentEvents: (db.shipment_events || []).map(normalizeShipmentEventRecord).filter(function(r) { return r.shipmentEventId || r.shipmentId || r.eventType; }),
        // Procurement Layer (Phase 1) — [] when the payload lacks the table (missing-header safe).
        requestOrders: (db.request_orders || []).map(normalizeRequestOrderRecord).filter(function(r) { return r.requestOrderId; }),
        requestOrderLines: (db.request_order_lines || []).map(normalizeRequestOrderLineRecord).filter(function(r) { return r.requestOrderLineId || r.requestOrderId; }),
        purchaseOrders: (db.purchase_orders || []).map(normalizePurchaseOrderRecord).filter(function(r) { return r.purchaseOrderId; }),
        purchaseOrderLines: (db.purchase_order_lines || []).map(normalizePurchaseOrderLineRecord).filter(function(r) { return r.purchaseOrderLineId || r.purchaseOrderId; }),
        // Request Order second-layer allocation drafts (planning scratchpads — no stock movement).
        requestOrderAllocationDrafts: (db.request_order_allocation_drafts || []).map(normalizeRequestOrderAllocationDraftRecord).filter(function(r) { return r.requestAllocationDraftId; }),
        requestOrderAllocationDraftLines: (db.request_order_allocation_draft_lines || []).map(normalizeRequestOrderAllocationDraftLineRecord).filter(function(r) { return r.requestAllocationLineId || r.requestAllocationDraftId; }),
        // Inventory Replenishment shipping-allocation drafts (Recommendation/Execution Plan Draft = SSOT).
        shippingAllocationDrafts: (db.shipping_allocation_drafts || []).map(normalizeShippingAllocationDraftRecord).filter(function(r) { return r.allocationDraftId; }),
        shippingAllocationDraftLines: (db.shipping_allocation_draft_lines || []).map(normalizeShippingAllocationDraftLineRecord).filter(function(r) { return r.allocationDraftLineId || r.allocationDraftId; }),
        // Request Order site confirmations (site-level approval state — no stock movement, no request_orders).
        requestOrderSiteConfirmations: (db.request_order_site_confirmations || []).map(normalizeRequestOrderSiteConfirmationRecord).filter(function(r) { return r.siteConfirmationId; }),
        // Request Order line SOURCES — source of truth for company/site/month allocation detail (read-only
        // here; write handler is spec-only / pending). [] when the tab is absent (missing-header safe).
        requestOrderLineSources: (db.request_order_line_sources || []).map(normalizeRequestOrderLineSourceRecord),
        // Carrier / Route master layer (Carrier Rate Card v1 — read-only display + append-only import).
        // [] when the tab is absent (missing-header safe). carrier_rate_cards NEVER stores Lead Time.
        carriers: (db.carriers || []).map(normalizeCarrierRecord).filter(function(r) { return r.carrierId || r.carrierName; }),
        carrierRateCards: (db.carrier_rate_cards || []).map(normalizeCarrierRateCardRecord).filter(function(r) { return r.rateCardId || r.carrierId; }),
        carrierLeadTimes: (db.carrier_lead_times || []).map(normalizeCarrierLeadTimeRecord).filter(function(r) { return r.leadTimeId || r.carrierId; }),
        // SKU Domain v2.0 — Regional/Compliance Master (Layer 2) + Tax/Referral Reference Master (Layer 4).
        // [] when the tab is absent (missing-header safe). Tax reference is READ-ONLY (no engine).
        skuRegionalDetails: (db.sku_regional_details || []).map(normalizeSkuRegionalDetailRecord).filter(function(r) { return r.regionalDetailId || r.sku; }),
        taxReferralRates: (db.tax_referral_rates || []).map(normalizeTaxReferralRateRecord).filter(function(r) { return r.taxRateId || r.series; }),
        taxRateComponents: (db.tax_rate_components || []).map(normalizeTaxRateComponentRecord).filter(function(r) { return r.taxComponentId || r.taxRateId; })
    };
}

// SKU Regional Details (SKU Domain v2.0 Layer 2). Regional identity + compliance-document fields ONLY.
// NO tax/duty/hscode/declared-value here (those live in tax_referral_rates). Match grain: sku+company+country+marketplace.
function normalizeSkuRegionalDetailRecord(raw) {
    var r = raw || {};
    function s(v) { return String(v == null ? '' : v).trim(); }
    return {
        regionalDetailId: s(r.regional_detail_id),
        sku: s(r.sku),
        company: s(r.company),
        country: s(r.country),
        marketplace: s(r.marketplace),
        siteSku: s(r.site_sku),
        // Canonical platform-neutral id; legacy asin READ-fallback only.
        marketplaceProductId: s(r.marketplace_product_id) || s(r.asin),
        productUrl: s(r.product_url),   // country/marketplace-specific product listing URL (nullable)
        packagingRegulation: s(r.packaging_regulation),
        regulationUrl: s(r.regulation_url),
        language: s(r.language) || s(r.manual_language),   // v1 manual_language read-fallback
        manualVersion: s(r.manual_version),
        labelVersion: s(r.label_version),
        batteryRegulation: s(r.battery_regulation),
        createdAt: s(r.created_at),
        updatedAt: s(r.updated_at),
        raw: r
    };
}

// Tax & Referral Rates (SKU Domain v2.0 Layer 4 — Reference Master). READ-ONLY here; no calculation.
// Single source of truth for HS Code / Duty / VAT / Referral / Declared Value. Keyed by series (+ duty_country).
function normalizeTaxReferralRateRecord(raw) {
    var r = raw || {};
    function s(v) { return String(v == null ? '' : v).trim(); }
    function n(v) { return (v === '' || v == null || isNaN(parseFloat(v))) ? '' : parseFloat(v); }
    return {
        taxRateId: s(r.tax_rate_id),
        series: s(r.series),
        countryOfOrigin: s(r.country_of_origin),
        dutyCountry: s(r.duty_country),
        hscode: s(r.hscode),                                              // canonical (spec §I camelCase = hscode)
        hsCode: s(r.hscode),                                              // existing-consumer alias (sku-handbook / overrides)
        dutyRate: n(r.duty_rate),
        vatNo: s(r.vat_no),                                               // VAT / tax registration number (nullable)
        eoriNo: s(r.eori_no),                                             // EORI registration number for EU/UK customs (nullable)
        vatRate: n(r.vat_rate) !== '' ? n(r.vat_rate) : n(r.vat),          // canonical vat_rate; legacy `vat` READ-fallback only
        portTaxRate: n(r.port_tax_rate) !== '' ? n(r.port_tax_rate) : n(r.port_tax),   // canonical port_tax_rate; legacy `port_tax` READ-fallback only
        referralFeeRate: n(r.referral_fee_rate),
        declaredValue: n(r.declared_value),
        declaredCurrency: s(r.declared_currency),
        effectiveFrom: s(r.effective_from),
        effectiveTo: s(r.effective_to),                                   // blank = open-ended (never invalid)
        note: s(r.note),
        createdAt: s(r.created_at),
        updatedAt: s(r.updated_at),
        raw: r
    };
    // NOTE (v2): retired v1 column `extra_tax_rate` is intentionally NOT exposed as a canonical property.
}

// Tax rate COMPONENT (child of tax_referral_rates). Optional additional/compound tax element.
// See TAX_AND_REFERRAL_RATES_SPEC.md §2.2/§6. Rate convention = whole-number percent (§7).
function normalizeTaxRateComponentRecord(raw) {
    var r = raw || {};
    function s(v) { return String(v == null ? '' : v).trim(); }
    function n(v) { return (v === '' || v == null || isNaN(parseFloat(v))) ? '' : parseFloat(v); }
    return {
        taxComponentId: s(r.tax_component_id),
        taxRateId: s(r.tax_rate_id),                                      // FK → tax_referral_rates.tax_rate_id
        componentType: s(r.component_type),
        componentCode: s(r.component_code),
        componentName: s(r.component_name),
        rateType: s(r.rate_type),                                         // percentage | amount_per_unit | fixed_amount
        rateValue: n(r.rate_value),                                       // used when rate_type = percentage
        amountPerUnit: n(r.amount_per_unit),
        amountCurrency: s(r.amount_currency),
        quantityUnit: s(r.quantity_unit),
        effectiveFrom: s(r.effective_from),
        effectiveTo: s(r.effective_to),
        sourceUrl: s(r.source_url),
        note: s(r.note),
        createdAt: s(r.created_at),
        updatedAt: s(r.updated_at),
        raw: r
    };
}

// Carrier master (logistics provider). Reference/master data only — not a Decision Layer.
function normalizeCarrierRecord(raw) {
    var r = raw || {};
    return {
        carrierId: String(r.carrier_id || '').trim(),
        carrierCode: String(r.carrier_code || '').trim(),
        carrierName: String(r.carrier_name || '').trim(),
        carrierType: String(r.carrier_type || '').trim(),
        contactName: String(r.contact_name || '').trim(),
        contactEmail: String(r.contact_email || '').trim(),
        contactPhone: String(r.contact_phone || '').trim(),
        isActive: (function(v){ var s = String(v == null ? '' : v).trim().toLowerCase(); return s === 'true' || s === 'yes' || s === '1' || s === 'active'; })(r.is_active),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

// Carrier rate card (rate + validity ONLY). NO lead time / transit_days here (v1.4 — single source of
// truth for Lead Time is carrier_lead_times). Numbers coerced; blank stays '' where meaningful.
function normalizeCarrierRateCardRecord(raw) {
    var r = raw || {};
    function n(v) { return (v === '' || v == null || isNaN(parseFloat(v))) ? '' : parseFloat(v); }
    return {
        rateCardId: String(r.rate_card_id || '').trim(),
        carrierId: String(r.carrier_id || '').trim(),
        originCountry: String(r.origin_country || '').trim(),
        originCity: String(r.origin_city || '').trim(),
        destinationCountry: String(r.destination_country || '').trim(),
        destinationCity: String(r.destination_city || '').trim(),
        destinationPostalCodeStart: String(r.destination_postal_code_start || '').trim(),
        destinationPostalCodeEnd: String(r.destination_postal_code_end || '').trim(),
        destinationWarehouseCode: String(r.destination_warehouse_code || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        shippingMethod: String(r.shipping_method || '').trim(),
        lastMileDelivery: String(r.last_mile_delivery || '').trim(),
        // Localized display label for the service combination (display metadata; canonical fields above stay authoritative).
        shippingMethodLabel: String(r.shipping_method_label || '').trim(),
        chargeType: String(r.charge_type || '').trim(),
        chargeUnit: String(r.charge_unit || '').trim(),
        dimDivisor: n(r.dim_divisor),
        minBoxWeight: n(r.min_box_weight),
        minBoxWeightUnit: String(r.min_box_weight_unit || '').trim(),
        weightTier: n(r.weight_tier),
        weightTierUnit: String(r.weight_tier_unit || '').trim(),
        currency: String(r.currency || '').trim(),
        unitRate: n(r.unit_rate),
        minCharge: n(r.min_charge),
        fuelSurcharge: n(r.fuel_surcharge),
        customsFee: n(r.customs_fee),
        docFee: n(r.doc_fee),
        transitType: String(r.transit_type || '').trim(),
        batteryType: String(r.battery_type || '').trim(),
        customsType: String(r.customs_type || '').trim(),
        // Localized customs Label (display metadata; enum stays authoritative). Blank rows derive from the map.
        customsTypeLabel: String(r.customs_type_label || '').trim() || customsTypeLabelFallback_(r.customs_type),
        // import_duty_treatment: included_in_rate | excluded_in_rate | '' (blank = needs data completion;
        // NEVER auto-derived from customs_type; a blank must NOT be treated as a known cross-border result).
        importDutyTreatment: String(r.import_duty_treatment || '').trim(),
        note: String(r.note || '').trim(),
        effectiveFrom: String(r.effective_from || '').trim(),
        effectiveTo: String(r.effective_to || '').trim(),
        status: String(r.status || '').trim(),
        sourceFileName: String(r.source_file_name || '').trim(),
        importBatchId: String(r.import_batch_id || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

// Carrier lead time — the SINGLE SOURCE OF TRUTH for Lead Time (display-only join on the Rate Card page).
function normalizeCarrierLeadTimeRecord(raw) {
    var r = raw || {};
    function n(v) { return (v === '' || v == null || isNaN(parseFloat(v))) ? '' : parseFloat(v); }
    return {
        leadTimeId: String(r.lead_time_id || '').trim(),
        carrierId: String(r.carrier_id || '').trim(),
        originCountry: String(r.origin_country || '').trim(),
        destinationCountry: String(r.destination_country || '').trim(),
        shippingMethod: String(r.shipping_method || '').trim(),
        lastMileDelivery: String(r.last_mile_delivery || '').trim(),
        minDays: n(r.min_days),
        maxDays: n(r.max_days),
        avgDays: n(r.avg_days),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

// Request Order line source — the append-only company/site/month allocation detail behind each request
// line. Source of truth for the Company Allocation popup. Written at request creation (13_ createRequestOrderDraft).
// Reads whatever the tab contains (numbers coerced). PK = request_order_line_source_id (legacy line_source_id
// read as fallback). tier_type / source_bucket = T1/T2/T3; source_month = YYYY-MM.
function normalizeRequestOrderLineSourceRecord(raw) {
    var r = raw || {};
    function n(v) { return (v === '' || v == null || isNaN(parseFloat(v))) ? '' : parseFloat(v); }
    return {
        lineSourceId: String(r.request_order_line_source_id || r.line_source_id || '').trim(),
        requestOrderLineId: String(r.request_order_line_id || '').trim(),
        requestOrderId: String(r.request_order_id || '').trim(),
        sku: String(r.sku || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        siteSku: String(r.site_sku || '').trim(),
        marketplaceProductId: String(r.marketplace_product_id || r.asin || '').trim(),
        tierType: String(r.tier_type || r.request_bucket || '').trim(),
        sourceMonth: String(r.source_month || r.request_month || '').trim(),
        forecastQty: n(r.forecast_qty),
        currentStock: n(r.current_stock),
        onTheWayQty: n(r.on_the_way_qty),
        shortageQty: n(r.shortage_qty),
        reallocationQty: n(r.reallocation_qty),
        recommendedQty: n(r.recommended_qty),
        requestedQty: parseFloat(r.requested_qty) || 0,
        approvedQty: parseFloat(r.approved_qty) || 0,
        allocationMethod: String(r.allocation_method || '').trim(),
        sourceBucket: String(r.source_bucket || r.tier_type || '').trim(),
        sourcePriority: n(r.source_priority),
        sourceType: String(r.source_type || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

// Request Order site confirmation. Upsert key = planning_cycle + company + country + marketplace +
// series + bucket. status enum pending/confirmed/cancelled. Records approval only (Confirm Site).
function normalizeRequestOrderSiteConfirmationRecord(raw) {
    var r = raw || {};
    return {
        siteConfirmationId: String(r.site_confirmation_id || '').trim(),
        planningCycle: String(r.planning_cycle || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        series: String(r.series || '').trim(),
        bucket: String(r.bucket || '').trim(),
        status: String(r.status || '').trim(),
        confirmedBy: String(r.confirmed_by || '').trim(),
        confirmedAt: String(r.confirmed_at || '').trim(),
        note: String(r.note || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

// Request Order second-layer allocation draft (header). Planning scratchpad only (no stock effect).
// Request Order second-layer allocation draft (header). CANONICAL fields (2026-07-27 DB sync);
// generation_type replaces the retired source_type, category_snapshot/series_snapshot replace
// category/series. Legacy columns are read ONLY as a compatibility fallback (never written).
function normalizeRequestOrderAllocationDraftRecord(raw) {
    var r = raw || {};
    function pick(canon, legacy) { var v = r[canon]; if (v == null || v === '') v = legacy != null ? r[legacy] : ''; return String(v || '').trim(); }
    return {
        requestAllocationDraftId: String(r.request_allocation_draft_id || '').trim(),
        planningCycle: String(r.planning_cycle || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        sku: String(r.sku || '').trim(),
        categorySnapshot: pick('category_snapshot', r.category),   // legacy: category
        seriesSnapshot: pick('series_snapshot', r.series),         // legacy: series
        status: String(r.status || '').trim(),
        generationType: pick('generation_type', r.source_type),    // legacy: source_type (retired)
        draftPurpose: String(r.draft_purpose || '').trim(),
        calculationRunId: String(r.calculation_run_id || '').trim(),
        formulaVersion: String(r.formula_version || '').trim(),
        calculatedAt: String(r.calculated_at || '').trim(),
        sourceDataAsOf: String(r.source_data_as_of || '').trim(),
        draftVersion: String(r.draft_version || '').trim(),
        createdBy: String(r.created_by || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedBy: String(r.updated_by || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        submittedBy: String(r.submitted_by || '').trim(),
        submittedAt: String(r.submitted_at || '').trim(),
        cancelledBy: String(r.cancelled_by || '').trim(),
        cancelledAt: String(r.cancelled_at || '').trim(),
        cancelReason: String(r.cancel_reason || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

// Request Order second-layer allocation draft (line). request_bucket = T1/T2/T3. CANONICAL fields
// (2026-07-27 DB sync): regular_demand_snapshot (legacy fc_qty_snapshot) · destination_stock_snapshot
// (legacy site_stock_snapshot) · third_party_available_qty_snapshot (legacy third_party_stock_snapshot)
// · factory_available_qty_snapshot (legacy factory_stock_snapshot). recommended_qty (system Suggested
// Order snapshot) and order_qty (user input) stay independent. Blank numeric snapshots stay blank (a
// not-yet-calculated Engine A/B value is never coerced to 0). Legacy columns are read-only fallbacks.
function normalizeRequestOrderAllocationDraftLineRecord(raw) {
    var r = raw || {};
    function n(v) { return (v === '' || v == null || isNaN(parseFloat(v))) ? '' : parseFloat(v); }
    function nfb(canon, legacy) { var v = r[canon]; if (v == null || v === '') v = legacy; return n(v); }
    return {
        requestAllocationLineId: String(r.request_allocation_line_id || '').trim(),
        requestAllocationDraftId: String(r.request_allocation_draft_id || '').trim(),
        requestMonth: String(r.request_month || '').trim(),
        requestBucket: String(r.request_bucket || '').trim(),
        regularDemandSnapshot: nfb('regular_demand_snapshot', r.fc_qty_snapshot),
        specialEventDemandSnapshot: n(r.special_event_demand_snapshot),
        destinationStockSnapshot: nfb('destination_stock_snapshot', r.site_stock_snapshot),
        thirdPartyAvailableQtySnapshot: nfb('third_party_available_qty_snapshot', r.third_party_stock_snapshot),
        qualifiedIncomingSnapshot: n(r.qualified_incoming_snapshot),
        approvedSupplySnapshot: n(r.approved_supply_snapshot),
        factoryAvailableQtySnapshot: nfb('factory_available_qty_snapshot', r.factory_stock_snapshot),
        targetPctSnapshot: n(r.target_pct_snapshot),
        calculatedGapQtySnapshot: n(r.calculated_gap_qty_snapshot),
        recommendedShippingQtySnapshot: n(r.recommended_shipping_qty_snapshot),
        residualProductionRequiredSnapshot: n(r.residual_production_required_snapshot),
        reallocationInQtySnapshot: n(r.reallocation_in_qty_snapshot),
        reallocationOutQtySnapshot: n(r.reallocation_out_qty_snapshot),
        netOrderNeedSnapshot: n(r.net_order_need_snapshot),
        recommendedQty: n(r.recommended_qty),
        orderQty: n(r.order_qty),
        cartonQty: n(r.carton_qty),
        unitsPerCarton: n(r.units_per_carton),
        allocationMethod: String(r.allocation_method || '').trim(),
        recommendationReason: String(r.recommendation_reason || '').trim(),
        recommendationFlags: String(r.recommendation_flags || '').trim(),
        lineStatus: String(r.line_status || '').trim(),
        submittedBy: String(r.submitted_by || '').trim(),
        submittedAt: String(r.submitted_at || '').trim(),
        note: String(r.note || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
}

// Inventory Replenishment shipping-allocation draft (header). Persisted Draft = SSOT for the cycle
// (INVENTORY_TABLE_MAPPING_SPEC §11.4). Planning only — no stock effect. generation_type replaces
// the legacy source_type. `raw` is preserved so the Recommendation Summary can read snapshot columns.
function normalizeShippingAllocationDraftRecord(raw) {
    var r = raw || {};
    return {
        allocationDraftId: String(r.allocation_draft_id || '').trim(),
        planningCycle: String(r.planning_cycle || '').trim(),
        sourcePage: String(r.source_page || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        status: String(r.status || '').trim(),
        generationType: String(r.generation_type || r.source_type || '').trim(),   // source_type = legacy read-fallback
        calculationRunId: String(r.calculation_run_id || '').trim(),
        calculatedAt: String(r.calculated_at || '').trim(),
        sourceDataAsOf: String(r.source_data_as_of || '').trim(),
        draftVersion: String(r.draft_version || '').trim(),
        createdBy: String(r.created_by || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedBy: String(r.updated_by || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        submittedBy: String(r.submitted_by || '').trim(),
        submittedAt: String(r.submitted_at || '').trim(),
        note: String(r.note || '').trim(),
        raw: r
    };
}

// Inventory Replenishment shipping-allocation draft (line). recommended_qty = immutable system
// snapshot (legacy alias recommand_shipment_draft_qty); planned_qty = user execution qty (legacy
// aliases shipment_draft_qty / qty). MUST-NOT-store display fields are never read as canonical.
function normalizeShippingAllocationDraftLineRecord(raw) {
    var r = raw || {};
    function n(v) { return (v === '' || v == null || isNaN(parseFloat(v))) ? '' : parseFloat(v); }
    return {
        allocationDraftLineId: String(r.allocation_draft_line_id || '').trim(),
        allocationDraftId: String(r.allocation_draft_id || '').trim(),
        sku: String(r.sku || '').trim(),
        siteSku: String(r.site_sku || '').trim(),
        routeNo: String(r.route_no || '').trim(),
        lineStatus: String(r.line_status || '').trim(),
        windowCode: String(r.window_code || '').trim(),
        requiredByDate: String(r.required_by_date || '').trim(),
        calculatedGapQty: n(r.calculated_gap_qty),
        // recommended_qty canonical; recommand_shipment_draft_qty = legacy read/migration alias only.
        recommendedQty: n(r.recommended_qty != null && r.recommended_qty !== '' ? r.recommended_qty : r.recommand_shipment_draft_qty),
        recommendedShippingMethod: String(r.recommended_shipping_method || '').trim(),
        recommendedCarrierId: String(r.recommended_carrier_id || '').trim(),
        recommendedLastMileDelivery: String(r.recommended_last_mile_delivery || '').trim(),
        recommendedExpectedArrival: String(r.recommended_expected_arrival || '').trim(),
        recommendationReason: String(r.recommendation_reason || '').trim(),
        // planned_qty canonical; shipment_draft_qty / qty = legacy read/migration aliases only.
        plannedQty: n(r.planned_qty != null && r.planned_qty !== '' ? r.planned_qty : (r.shipment_draft_qty != null && r.shipment_draft_qty !== '' ? r.shipment_draft_qty : r.qty)),
        shipFrom: String(r.ship_from || '').trim(),
        destination: String(r.destination || '').trim(),
        selectedShippingMethod: String(r.selected_shipping_method || '').trim(),
        selectedLeadTimeId: String(r.selected_lead_time_id || '').trim(),
        selectedCarrierId: String(r.selected_carrier_id || '').trim(),
        expectedArrival: String(r.expected_arrival || '').trim(),
        overrideReason: String(r.override_reason || '').trim(),
        unitsPerCarton: n(r.units_per_carton),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
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

// Scoped runtime diagnostics for the data chain (Global Logistics Map repair, 2026-07-24). Records, per
// key table, the RAW row count from the Web App response vs the KEPT (normalized+filtered) count, plus the
// raw column keys of the first row — so a break can be located from runtime evidence (raw 0 = getter/sheet/
// router; raw N & kept 0 = normalizer/column-name filter; sampleKeys shows the real column names). Read via
// window._opDbDiag or KM.DB.getDataDiagnostics(). No sensitive full payload is stored (keys + counts only).
function _computeOpDbDiag(rawDb, normalized, sourceMode) {
    var map = {
        logistics_locations: 'logisticsLocations', shipment_route_templates: 'shipmentRouteTemplates',
        shipment_route_template_nodes: 'shipmentRouteTemplateNodes', shipment_routes: 'shipmentRoutes',
        shipment_events: 'shipmentEvents', shipments: 'shipments', warehouses: 'warehouses'
    };
    var diag = { sourceMode: sourceMode || 'unknown', at: new Date().toISOString(), tables: {} };
    Object.keys(map).forEach(function (t) {
        var raw = (rawDb && rawDb[t]) || [];
        var kept = (normalized && normalized[map[t]]) || [];
        diag.tables[t] = { raw: raw.length, kept: kept.length, sampleKeys: raw.length ? Object.keys(raw[0] || {}) : [] };
    });
    return diag;
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
            try { window._opDbDiag = _computeOpDbDiag(rawDb, normalized, 'google-sheet'); } catch (dErr) {}
            window._opDbCache = normalized;
            OperationDbState.data = normalized;
            OperationDbState.dataSourceMode = 'google-sheet';
            OperationDbState.lastLoadedAt = new Date().toISOString();
            OperationDbState.lastError = null;
            console.log('[OP DB] Loaded from Google Sheet. SKUs:', normalized.skuDetails.length);
            return normalized;
        } catch (e) {
            OperationDbState.lastFetchStatus = 'failed';
            OperationDbState.lastError = e.message;
            // Preserve a previously-good Google Sheet cache on a (forced) reload failure. Clobbering it
            // with mock data would silently drop shipping_plans / shipments and flip the UI to demo mode
            // (the "card disappears after Save / reappears after refresh" bug). A write that already
            // succeeded server-side stays visible; the next successful load reconciles any staleness.
            if (window._opDbCache && window._opDbCache._sourceMode === 'google-sheet') {
                console.warn('[OP DB] Google Sheet reload failed:', e.message, '- keeping existing cloud cache.');
                window._opDbCache._apiFailed = true;
                OperationDbState.lastLoadedAt = new Date().toISOString();
                return window._opDbCache;
            }
            console.warn('[OP DB] Google Sheet API failed:', e.message, '- falling back to mock data.');
            window._opDbCache = _buildMockFallbackDb();
            window._opDbCache._sourceMode = 'mock';   // explicit: NEVER mistaken for production google-sheet data
            window._opDbCache._apiFailed = true;
            window._opDbCache._apiError = e.message;
            window._opDbDiag = { sourceMode: 'mock', at: new Date().toISOString(), apiError: e.message, tables: {} };
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

// SINGLE canonical frontend Web App endpoint authority (READ-ONLY getter, API Transport Hotfix T1). The API
// Foundation's ApiTransport resolves the Web App URL through this at call time — it does NOT duplicate the
// literal URL. Returns '' when unconfigured (→ fail-closed TRANSPORT_NOT_CONFIGURED). Exposes no new secret:
// the same exec URL Legacy already uses; the Script ID is masked in any Foundation diagnostic/error surface.
window.KM.DB.getApiBaseUrl = function() { return isOperationDbApiConfigured() ? OP_DB_API_BASE_URL : ''; };

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

window.KM.DB.getMarketplaces = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.marketplaces || [];
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

window.KM.DB.getFactoryStock = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.factoryStock || [];
};

// supplier_price_list (v1 lead-time / cost source). [] when the tab is absent (missing-source safe).
window.KM.DB.getSupplierPriceList = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.supplierPriceList || [];
};

window.KM.DB.getFactoryStockMovements = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.factoryStockMovements || [];
};

window.KM.DB.getWarehouses = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.warehouses || [];
};

// replenishment_demand_allocation_rules — Phase-1 multi-warehouse demand-allocation authority (F1-4B-E).
// TARGETED, READ-ONLY over the already-loaded cache — never a whole-DB load, never a fetch, and the runtime
// NEVER creates/repairs the sheet. [] when the cache is unloaded or the tab is absent → downstream
// DEMAND_ALLOCATION_RULE_NOT_CONFIGURED (never a default ratio).
window.KM.DB.getReplenishmentDemandAllocationRules = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.replenishmentDemandAllocationRules || [];
};

window.KM.DB.getOverseasInventorySnapshot = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.overseasInventorySnapshot || [];
};

window.KM.DB.getOverseasInventoryMovements = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.overseasInventoryMovements || [];
};

// Amazon snapshot + forecast-event source getters (read-only). Return [] when the cache is
// unloaded or the payload does not include the table — callers must safe-fallback to 0.
window.KM.DB.getAmazonInventorySnapshot = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.amazonInventorySnapshot || [];
};

window.KM.DB.getAmazonInventoryHealthSnapshot = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.amazonInventoryHealthSnapshot || [];
};

window.KM.DB.getAmazonDailySalesSnapshot = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.amazonDailySalesSnapshot || [];
};

window.KM.DB.getAmazonWeeklySalesSnapshot = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.amazonWeeklySalesSnapshot || [];
};

window.KM.DB.getFcSpecialEvents = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.fcSpecialEvents || [];
};

window.KM.DB.getFcTargetRules = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.fcTargetRules || [];
};

// Weekly Shipping Plan (Decision Layer) getters.
window.KM.DB.getShippingPlans = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.shippingPlans || [];
};

window.KM.DB.getShippingPlanLines = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.shippingPlanLines || [];
};

// Shipment (Execution Layer) getters.
window.KM.DB.getShipments = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.shipments || [];
};

window.KM.DB.getShipmentLines = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.shipmentLines || [];
};

// Global Logistics Map getters (READ-ONLY). Return [] when the cache is unloaded or the payload
// does not include the tab (e.g. logistics_locations not yet created, or Apps Script not redeployed).
window.KM.DB.getLogisticsLocations = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.logisticsLocations || [];
};
window.KM.DB.getShipmentRouteTemplates = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.shipmentRouteTemplates || [];
};
window.KM.DB.getShipmentRouteTemplateNodes = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.shipmentRouteTemplateNodes || [];
};
window.KM.DB.getShipmentRoutes = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.shipmentRoutes || [];
};
// Runtime data-chain diagnostics (raw vs kept counts + sample column keys per key table + source mode).
// Used by the Global Logistics Map debug panel to locate a break from runtime evidence.
window.KM.DB.getDataDiagnostics = function() { return window._opDbDiag || null; };
// Current data source: 'google-sheet' (production) | 'mock' (API failed/unconfigured fallback) | 'not-loaded'.
window.KM.DB.getDataSourceMode = function() { return window._opDbCache ? (window._opDbCache._sourceMode || 'mock') : 'not-loaded'; };
window.KM.DB.getShipmentEvents = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.shipmentEvents || [];
};

// Procurement Layer (Phase 1) getters. Return [] when the cache is unloaded or the payload
// does not include the table (missing procurement tabs are created on first write).
window.KM.DB.getRequestOrders = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.requestOrders || [];
};

window.KM.DB.getRequestOrderLines = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.requestOrderLines || [];
};

window.KM.DB.getPurchaseOrders = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.purchaseOrders || [];
};

// F1-7C: expose the canonical PO normalizers so a scoped-workspace page adapter can produce records IDENTICAL to the
// broad-cache getters from the workspace DTO's raw passthrough (guarantees BEFORE == AFTER). Read-only, pure mappers.
window.KM.DB.normalizePurchaseOrder = function(raw) { return normalizePurchaseOrderRecord(raw); };
window.KM.DB.normalizePurchaseOrderLine = function(raw) { return normalizePurchaseOrderLineRecord(raw); };

// F1-7C: adapt the scoped purchaseOrder workspace View-Model to the SAME record shapes the PO pages consume from the
// broad cache — orders/lines via the canonical normalizers (BEFORE == AFTER), plus the scoped sku/warehouse subsets.
// remaining_qty is BACKEND-OWNED: the DTO always supplies it, so the page never derives max(0, completed - shipped).
window.KM.DB.adaptPurchaseOrderWorkspace = function(data) {
    data = data || {};
    var orders = (data.purchaseOrders || []).map(function(p) { return normalizePurchaseOrderRecord((p && p.raw) || {}); });
    var lines = [];
    var det = data.detailsByPurchaseOrderId || {};
    Object.keys(det).forEach(function(poId) {
        (((det[poId] || {}).lines) || []).forEach(function(l) {
            var n = normalizePurchaseOrderLineRecord((l && l.raw) || {});
            // Backend-owned remaining_qty (persisted, else max(0, completed - shipped)) — override so it is always present.
            if (l && l.remainingQty != null && l.remainingQty !== '') n.remainingQty = parseFloat(l.remainingQty) || 0;
            lines.push(n);
        });
    });
    var skuDetails = (data.skuDetails || []).map(function(s) { return { sku: s.sku, category: s.category, series: s.series }; });
    var warehouses = (data.warehouses || []).map(function(w) { return { warehouseId: w.warehouseId, warehouseName: w.warehouseName }; });
    return { orders: orders, lines: lines, skuDetails: skuDetails, warehouses: warehouses };
};

// F1-7D: expose the canonical Request Order normalizers so a scoped-workspace page adapter produces records IDENTICAL
// to the broad-cache getters from the workspace DTO's raw passthrough (guarantees BEFORE == AFTER). Read-only mappers.
window.KM.DB.normalizeRequestOrder = function(raw) { return normalizeRequestOrderRecord(raw); };
window.KM.DB.normalizeRequestOrderLine = function(raw) { return normalizeRequestOrderLineRecord(raw); };

// F1-7J-A2: expose the canonical sku_details normalizer so the Weekly Shipping read-model adapter can re-normalize the
// bounded SKU-logistics projection (40_ `skuDetails`) into records IDENTICAL to the broad-cache getSkuDetails() records
// (BEFORE == AFTER for _spLineLogistics carton dims + weights). Read-only mapper.
window.KM.DB.normalizeSkuDetail = function(raw) { return normalizeSkuDetailsRecord(raw); };

// F1-7D: adapt the scoped requestOrder workspace View-Model to the SAME record shapes the Request Order Draft page
// consumes from the broad cache. Orders/lines run through the canonical normalizers on the DTO `raw` passthrough; the
// master subsets (line sources / warehouses / sku_details / supplier_price_list) run through their SAME normalizers.
// The per-array filters MATCH normalizeOperationDb so the adapted arrays equal the legacy getters exactly (BEFORE ==
// AFTER). Composes persisted truth ONLY — no Gap/Forecast/Recommendation, no draft engine, no RO->PO.
window.KM.DB.adaptRequestOrderWorkspace = function(data) {
    data = data || {};
    var orders = (data.requestOrders || []).map(function(o) { return normalizeRequestOrderRecord((o && o.raw) || {}); })
        .filter(function(r) { return r.requestOrderId; });
    var lines = [];
    var det = data.detailsByRequestOrderId || {};
    Object.keys(det).forEach(function(roId) {
        (((det[roId] || {}).lines) || []).forEach(function(l) {
            var n = normalizeRequestOrderLineRecord((l && l.raw) || {});
            if (n.requestOrderLineId || n.requestOrderId) lines.push(n);
        });
    });
    var lineSources = (data.lineSources || []).map(function(s) { return normalizeRequestOrderLineSourceRecord(s || {}); });
    var warehouses = (data.warehouses || []).map(function(w) { return normalizeWarehouseRecord(w || {}); })
        .filter(function(r) { return r.warehouseId || r.warehouseName; });
    var skuDetails = (data.skuDetails || []).map(function(d) { return normalizeSkuDetailsRecord(d || {}); })
        .filter(function(r) { return r.sku; });
    var supplierPriceList = (data.supplierPriceList || []).map(function(r) { return normalizeSupplierPriceListRecord(r || {}); })
        .filter(function(r) { return r.sku; });
    return { orders: orders, lines: lines, lineSources: lineSources, warehouses: warehouses, skuDetails: skuDetails, supplierPriceList: supplierPriceList };
};

// F1-7F: expose the canonical Shipment normalizers so a scoped-workspace page adapter produces records IDENTICAL to the
// broad-cache getters from the workspace DTO's raw passthrough (BEFORE == AFTER). Read-only, pure mappers.
window.KM.DB.normalizeShipment = function(raw) { return normalizeShipmentRecord(raw); };
window.KM.DB.normalizeShipmentLine = function(raw) { return normalizeShipmentLineRecord(raw); };

// F1-7F: adapt the scoped shipment workspace View-Model to the SAME arrays the Shipment pages consume from the broad
// cache — each table run through its canonical normalizer with the SAME per-array filter normalizeOperationDb applies,
// so the adapted arrays equal the legacy getters exactly. Composes persisted shipment facts ONLY (no FIFO/allocation/
// PO/receipt/factory authority). Map-extra arrays are present only when the workspace was called with their include.
window.KM.DB.adaptShipmentWorkspace = function(data) {
    data = data || {};
    var shipments = (data.shipments || []).map(function(s) { return normalizeShipmentRecord((s && s.raw) || {}); }).filter(function(r) { return r.shipmentId; });
    var shipmentLines = (data.shipmentLines || []).map(normalizeShipmentLineRecord).filter(function(r) { return r.shipmentLineId || r.shipmentId; });
    var warehouses = (data.warehouses || []).map(normalizeWarehouseRecord).filter(function(r) { return r.warehouseId || r.warehouseName; });
    var carrierRateCards = (data.carrierRateCards || []).map(normalizeCarrierRateCardRecord).filter(function(r) { return r.rateCardId || r.carrierId; });
    var out = { shipments: shipments, shipmentLines: shipmentLines, warehouses: warehouses, carrierRateCards: carrierRateCards };
    // Map-extras (On-the-Way) — same normalizers + filters as normalizeOperationDb; [] when the include was not requested.
    out.shipmentRoutes = (data.shipmentRoutes || []).map(normalizeShipmentRouteRecord).filter(function(r) { return r.shipmentRouteId || r.shipmentId || r.locationName || r.latitude !== null; });
    out.shipmentEvents = (data.shipmentEvents || []).map(normalizeShipmentEventRecord).filter(function(r) { return r.shipmentEventId || r.shipmentId || r.eventType; });
    out.logisticsLocations = (data.logisticsLocations || []).map(normalizeLogisticsLocationRecord).filter(function(r) { return r.logisticsLocationId || r.locationCode || r.locationName || r.warehouseId || r.factoryId || r.latitude !== null; });
    out.shipmentRouteTemplates = (data.shipmentRouteTemplates || []).map(normalizeShipmentRouteTemplateRecord).filter(function(r) { return r.routeTemplateId || r.routeTemplateName || r.destinationCountry || r.originCountry; });
    out.shipmentRouteTemplateNodes = (data.shipmentRouteTemplateNodes || []).map(normalizeShipmentRouteTemplateNodeRecord).filter(function(r) { return r.routeTemplateNodeId || r.routeTemplateId || r.nodeName || r.nodeCode || r.latitude !== null; });
    return out;
};

// F1-7G: adapt the scoped FC Summary workspace View-Model to the SAME arrays the FC Summary page consumes from the broad
// cache — each table run through its canonical normalizer with the SAME per-array filter normalizeOperationDb applies, so
// the adapted arrays equal the legacy getters (getFcRegularForecast / getFcSpecialEvents / getFcTargetRules /
// getMarketplaces) exactly, including the preserved `.raw` passthrough the render getters read. Composes persisted raw
// forecast rows ONLY (no Target% adjustment, no blending, no Gap/Recommendation; the Event Assist WRITE path is untouched).
window.KM.DB.adaptFcSummaryWorkspace = function(data) {
    data = data || {};
    var fcRegularForecast = (data.fcRegularForecast || []).map(normalizeFcRegularForecastRecord).filter(function(r) { return r.forecastId || r.sku; });
    var fcSpecialEvents = (data.fcSpecialEvents || []).map(normalizeFcSpecialEventRecord).filter(function(r) { return r.event || r.sku || r.scopeId; });
    var fcTargetRules = (data.fcTargetRules || []).map(normalizeFcTargetRuleRecord).filter(function(r) { return r.scopeId || r.ruleId; });
    var marketplaces = (data.marketplaces || []).map(normalizeMarketplaceRecord).filter(function(r) { return r.marketplaceId || r.marketplace; });
    return { fcRegularForecast: fcRegularForecast, fcSpecialEvents: fcSpecialEvents, fcTargetRules: fcTargetRules, marketplaces: marketplaces };
};

// F1-7H: adapt the scoped SKU Details workspace View-Model to the SAME arrays the SKU pages consume from the broad cache —
// each table run through its canonical normalizer with the SAME per-array filter normalizeOperationDb applies, so the
// adapted arrays equal the legacy getters (getSkuDetails / getTaxReferralRates / getTaxRateComponents / getMarketplaceSkus
// / getSkuRegionalDetails) exactly, including the preserved `.raw` passthrough the render/edit paths read. Transports raw
// persisted master/reference rows ONLY (no write side effects, no Factory Stock init, no Forecast/Gap/Recommendation). The
// 'regional' arrays are present only when the workspace was called with include.regional.
window.KM.DB.adaptSkuDetailsWorkspace = function(data) {
    data = data || {};
    var skuDetails = (data.skuDetails || []).map(normalizeSkuDetailsRecord).filter(function(r) { return r.sku; });
    var taxReferralRates = (data.taxReferralRates || []).map(normalizeTaxReferralRateRecord).filter(function(r) { return r.taxRateId || r.series; });
    var taxRateComponents = (data.taxRateComponents || []).map(normalizeTaxRateComponentRecord).filter(function(r) { return r.taxComponentId || r.taxRateId; });
    var out = { skuDetails: skuDetails, taxReferralRates: taxReferralRates, taxRateComponents: taxRateComponents };
    // 'regional' arrays (sku-regional-details.js) — same normalizers + filters as normalizeOperationDb; present only when include.regional.
    out.marketplaceSkus = (data.marketplaceSkus || []).map(normalizeMarketplaceSkuRecord).filter(function(r) { return r.sku; });
    out.skuRegionalDetails = (data.skuRegionalDetails || []).map(normalizeSkuRegionalDetailRecord).filter(function(r) { return r.regionalDetailId || r.sku; });
    return out;
};

// F1-7I: adapt the scoped Inventory Replenishment workspace View-Model to the SAME arrays the page's main-table assembly
// (_getCloudReplenishmentData's local get()) consumes from the broad cache — each table run through its canonical
// normalizer with the SAME per-array filter normalizeOperationDb applies, KEYED BY GETTER NAME so the page's get(name)
// choke point returns byte-identical arrays to the legacy KM.DB.getX() getters (BEFORE == AFTER), incl. the preserved
// `.raw` passthrough. Transports raw persisted rows ONLY — no Gap/Recommendation/allocation/FIFO/PO/incoming authority
// (the incoming reconstruction stays presentation-side over these rows; Gap/Reco/draft-SSOT stay on their own scoped owners).
window.KM.DB.adaptInventoryReplenishmentWorkspace = function(data) {
    data = data || {};
    return {
        getMarketplaces: (data.marketplaces || []).map(normalizeMarketplaceRecord).filter(function(r) { return r.marketplaceId || r.marketplace; }),
        getMarketplaceSkus: (data.marketplace_skus || []).map(normalizeMarketplaceSkuRecord).filter(function(r) { return r.sku; }),
        getSkuDetails: (data.sku_details || []).map(normalizeSkuDetailsRecord).filter(function(r) { return r.sku; }),
        getWarehouses: (data.warehouses || []).map(normalizeWarehouseRecord).filter(function(r) { return r.warehouseId || r.warehouseName; }),
        getAmazonInventorySnapshot: (data.amazon_inventory_snapshot || []).map(normalizeAmazonInventorySnapshotRecord).filter(function(r) { return r.sku; }),
        getAmazonInventoryHealthSnapshot: (data.amazon_inventory_health_snapshot || []).map(normalizeAmazonInventoryHealthSnapshotRecord).filter(function(r) { return r.sku; }),
        getAmazonDailySalesSnapshot: (data.amazon_daily_sales_snapshot || []).map(normalizeAmazonDailySalesSnapshotRecord).filter(function(r) { return r.sku; }),
        getAmazonWeeklySalesSnapshot: (data.amazon_weekly_sales_snapshot || []).map(normalizeAmazonWeeklySalesSnapshotRecord).filter(function(r) { return r.sku; }),
        getFcRegularForecast: (data.fc_regular_forecast || []).map(normalizeFcRegularForecastRecord).filter(function(r) { return r.forecastId || r.sku; }),
        getFcTargetRules: (data.fc_target_rules || []).map(normalizeFcTargetRuleRecord).filter(function(r) { return r.scopeId || r.ruleId; }),
        getFcSpecialEvents: (data.fc_special_events || []).map(normalizeFcSpecialEventRecord).filter(function(r) { return r.event || r.sku || r.scopeId; }),
        getOverseasInventorySnapshot: (data.overseas_inventory_snapshot || []).map(normalizeOverseasInventorySnapshotRecord).filter(function(r) { return r.warehouseId && r.sku; }),
        getFactoryStock: (data.factory_stock || []).map(normalizeFactoryStockRecord).filter(function(r) { return r.factoryStockId || r.sku; }),
        getShipments: (data.shipments || []).map(normalizeShipmentRecord).filter(function(r) { return r.shipmentId; }),
        getShipmentLines: (data.shipment_lines || []).map(normalizeShipmentLineRecord).filter(function(r) { return r.shipmentLineId || r.shipmentId; }),
        getShippingPlans: (data.shipping_plans || []).map(normalizeShippingPlanRecord).filter(function(r) { return r.shippingPlanId; }),
        getShippingPlanLines: (data.shipping_plan_lines || []).map(normalizeShippingPlanLineRecord).filter(function(r) { return r.shippingPlanLineId || r.shippingPlanId; }),
        getShippingAllocationDrafts: (data.shipping_allocation_drafts || []).map(normalizeShippingAllocationDraftRecord).filter(function(r) { return r.allocationDraftId; }),
        getShippingAllocationDraftLines: (data.shipping_allocation_draft_lines || []).map(normalizeShippingAllocationDraftLineRecord).filter(function(r) { return r.allocationDraftLineId || r.allocationDraftId; }),
        // F1-7J-A2: carrier reference (Execution-Plan panel) — present ONLY when the workspace was called with
        // include.carrierPlanning; [] otherwise. Same normalizers + filters as normalizeOperationDb → equal to the broad
        // getCarrierLeadTimes / getCarrierRateCards getters (BEFORE == AFTER). Reference data only (no carrier selection).
        getCarrierLeadTimes: (data.carrier_lead_times || []).map(normalizeCarrierLeadTimeRecord).filter(function(r) { return r.leadTimeId || r.carrierId; }),
        getCarrierRateCards: (data.carrier_rate_cards || []).map(normalizeCarrierRateCardRecord).filter(function(r) { return r.rateCardId || r.carrierId; })
    };
};

window.KM.DB.getRequestOrderAllocationDrafts = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.requestOrderAllocationDrafts || [];
};

window.KM.DB.getRequestOrderAllocationDraftLines = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.requestOrderAllocationDraftLines || [];
};

// Inventory Replenishment shipping-allocation drafts (Recommendation Summary + Execution Plan SSOT).
window.KM.DB.getShippingAllocationDrafts = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.shippingAllocationDrafts || [];
};
window.KM.DB.getShippingAllocationDraftLines = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.shippingAllocationDraftLines || [];
};

window.KM.DB.getRequestOrderSiteConfirmations = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.requestOrderSiteConfirmations || [];
};

window.KM.DB.getRequestOrderLineSources = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.requestOrderLineSources || [];
};

// ---- Carrier / Route master (Carrier Rate Card v1) — all missing-tab/header safe (return []). ----
window.KM.DB.getCarriers = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.carriers || [];
};
// F1-7J-A2: bounded marketplace REFERENCE read for the Request Order scope resolver — reuses the EXISTING generic
// getTable('marketplaces') GET action (single-table server read; NO new API/route), then runs the SAME normalizer + the
// SAME per-array filter as normalizeOperationDb so the result equals getMarketplaces() exactly (BEFORE == AFTER). Async;
// never getOperationDb / never the broad cache. The server-side filterRows_('marketplaces') keeps rows with
// marketplace_id||marketplace — identical to the filter below — so no row-parity drift.
window.KM.DB.getMarketplaceReference = async function() {
    var rows = await getOperationDbTableFromSheet('marketplaces');
    return (rows || []).map(normalizeMarketplaceRecord).filter(function(r) { return r.marketplaceId || r.marketplace; });
};

window.KM.DB.getCarrierRateCards = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.carrierRateCards || [];
};
window.KM.DB.getCarrierLeadTimes = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.carrierLeadTimes || [];
};

// ---- SKU Domain v2.0 — Regional Details (read+write) + Tax/Referral (read-only). Missing-tab safe. ----
window.KM.DB.getSkuRegionalDetails = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.skuRegionalDetails || [];
};
window.KM.DB.getTaxReferralRates = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.taxReferralRates || [];
};
window.KM.DB.getTaxRateComponents = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.taxRateComponents || [];
};

window.KM.DB.getPurchaseOrderLines = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.purchaseOrderLines || [];
};


window.KM.DB.getDataSourceMode = function() {
    return getOperationDbDataSourceMode();
};

window.KM.DB.isCloudWriteEnabled = function() {
    return isOperationDbApiConfigured() && getOperationDbDataSourceMode() === 'google-sheet';
};

window.KM.DB.updateSkuLifecycle = async function(sku, lifecycle) {
    if (window.KM.DB.isCloudWriteEnabled()) {
        // Cloud mode: sku_details.lifecycle is the SINGLE authority — write the sheet, then re-read fresh.
        // (F1-S1: no browser lifecycle override exists to clear anymore.)
        var result = await updateSkuLifecycleInSheet(sku, lifecycle);
        await loadOperationDb({ force: true });
        return result;
    } else {
        // Mock / no-cloud mode: lifecycle is NOT persisted to the browser (F1-S1 — authority = sku_details
        // only). Patch the in-memory cache so the current session reflects the change; a refresh reloads the
        // mock defaults. No localStorage override is written.
        if (window._opDbCache && Array.isArray(window._opDbCache.skuDetails)) {
            var rec = window._opDbCache.skuDetails.find(function(i) { return i.sku === sku; });
            if (rec) rec.lifecycle = lifecycle;
        }
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

window.KM.DB.upsertMarketplace = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, upsertMarketplace skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'upsertMarketplace' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert failed');
    await loadOperationDb({ force: true });
    return json.data;
};

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

// Upsert a sku_details row (create/update by sku). Currently writes the customs-facing fields
// product_name_cn / product_use (and any other allowlisted sku_details columns the handler accepts).
// Payload = { sku, product_name_cn?, product_use?, ... }.
window.KM.DB.upsertSkuDetail = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, upsertSkuDetail skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: 'upsertSkuDetail' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) {
        // Preserve the backend's structured error_code (e.g. duplicate_sku / not_found) on the thrown Error.
        var e = new Error(json.error || 'Upsert failed');
        if (json.error_code) e.error_code = json.error_code;
        throw e;
    }
    await loadOperationDb({ force: true });
    return json.data;
};

// SKU Domain v2.0 — upsert a sku_regional_details row (create/update by
// sku+company+country+marketplace). Payload = { sku, company, country, marketplace, site_sku?,
// marketplace_product_id?, product_url?, packaging_regulation?, regulation_url?, language?, manual_version?,
// label_version?, battery_regulation?, sync_marketplace_sku? }. When sync_marketplace_sku is truthy the
// handler also propagates site_sku / marketplace_product_id INTO the matching marketplace_skus row.
window.KM.DB.upsertSkuRegionalDetail = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, upsertSkuRegionalDetail skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'upsertSkuRegionalDetail' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert regional detail failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Tax & Referral Rate Master V2 — upsert ONE tax_referral_rates row (PARENT).
// Payload (snake_case): { tax_rate_id?, series, country_of_origin, duty_country, hscode?, duty_rate?,
//   vat_no?, vat_rate?, eori_no?, port_tax_rate?, referral_fee_rate?, declared_value?, declared_currency?,
//   effective_from, effective_to?, note?, create_version?, close_previous? }.
// tax_rate_id present + no create_version → correction (update in place). Otherwise → new version (new id).
// Returns { tax_rate_id, updated, created, version?, previous_closed?, warnings }. NO fake success —
// resolves only when the handler reports success (real DB write). See TAX_AND_REFERRAL_RATES_SPEC.md §9/§12.
window.KM.DB.upsertTaxReferralRate = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, upsertTaxReferralRate skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: 'upsertTaxReferralRate' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert tax referral rate failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Tax & Referral Rate Master V2 — upsert ONE tax_rate_components row (CHILD).
// Payload (snake_case): { tax_component_id?, tax_rate_id, component_type, component_code, component_name?,
//   rate_type, rate_value?, amount_per_unit?, amount_currency?, quantity_unit?, effective_from?,
//   effective_to?, source_url?, note? }. The parent tax_rate_id MUST exist (handler rejects orphans).
// Returns { tax_component_id, updated, created, warnings }.
window.KM.DB.upsertTaxRateComponent = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, upsertTaxRateComponent skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: 'upsertTaxRateComponent' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert tax rate component failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Confirm Shipment & Dispatch — the single orchestration command (2026-07-24). Finalizes the Formal
// Shipment (in_transit) + snapshots shipment_routes + creates the initial shipment_event + deducts
// factory_stock, atomically + idempotently on the backend. Payload (snake_case): { shipment_id (required),
// route_template_id? (explicit override), actor? }. Returns the FULL backend response { success, data?,
// error?, stage?, already_confirmed? } WITHOUT throwing, so the UI can show the failed stage + shipment_id
// and preserve input. Reloads the DB cache ONLY on success so On-the-Way immediately sees the new data.
window.KM.DB.confirmShipmentAndDispatch = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, confirmShipmentAndDispatch skipped');
        return { success: false, error: 'API not configured', stage: 'config' };
    }
    var json;
    try {
        var resp = await fetch(OP_DB_API_BASE_URL, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(Object.assign({ action: 'confirmShipmentAndDispatch' }, payload))
        });
        if (!resp.ok) return { success: false, error: 'API returned ' + resp.status, stage: 'network' };
        json = await resp.json();
    } catch (e) {
        return { success: false, error: (e && e.message) ? e.message : String(e), stage: 'network' };
    }
    if (json && json.success) { await loadOperationDb({ force: true }); }   // refresh cache so On-the-Way sees it
    return json;
};

// F1-5C-EXPORT-R3C — generate (and optionally render the real Drive file for) a shipment document from the frozen
// R2B snapshot via the canonical R3A/R3B/R3C backend chain. The frontend performs NO placeholder mapping / totals /
// master resolution / template selection / version choice — it only sends { shipment_id, document_type,
// generate_file, regenerate? } and opens the returned download_url. Returns the full backend envelope (success +
// document_id + file/download refs, or a fail-closed error/reason such as DOCUMENT_TEMPLATE_ASSET_MISSING).
window.KM.DB.generateShipmentDocument = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, generateShipmentDocument skipped');
        return { success: false, error: 'API not configured', stage: 'config' };
    }
    try {
        var resp = await fetch(OP_DB_API_BASE_URL, {
            method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(Object.assign({ action: 'shipmentDocument.generate' }, payload || {}))
        });
        if (!resp.ok) return { success: false, error: 'API returned ' + resp.status, stage: 'network' };
        return await resp.json();
    } catch (e) { return { success: false, error: (e && e.message) ? e.message : String(e), stage: 'network' }; }
};
// Open/download a generated document result in a new tab (download_url = PDF when present, else the editable file).
// Presentation only — the frontend never builds document content.
window.KM.DB.openGeneratedDocument = function(res) {
    var url = res && (res.download_url || res.pdf_file_url || res.file_url);
    if (url && typeof window !== 'undefined' && window.open) { window.open(url, '_blank', 'noopener'); return true; }
    return false;
};

// F1-5B-SHIP-R3C — reconcile canonical DRAFT PO→FIFO allocations for a shipment. Thin adapter to the SINGLE R3A
// backend authority (action: generateShipmentLineAllocations); the frontend performs NO FIFO / capacity / shipped
// math. One shipment-scoped call reconciles all lines (no per-SKU fan-out). Refreshes the cache on success so the
// draft shipment_line_allocations are visible before Confirm & Dispatch (R3B).
window.KM.DB.generateShipmentLineAllocations = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, generateShipmentLineAllocations skipped');
        return { success: false, error: 'API not configured', stage: 'config' };
    }
    var json;
    try {
        var resp = await fetch(OP_DB_API_BASE_URL, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(Object.assign({ action: 'generateShipmentLineAllocations' }, payload))
        });
        if (!resp.ok) return { success: false, error: 'API returned ' + resp.status, stage: 'network' };
        json = await resp.json();
    } catch (e) {
        return { success: false, error: (e && e.message) ? e.message : String(e), stage: 'network' };
    }
    if (json && json.success) { await loadOperationDb({ force: true }); }   // refresh cache so draft allocations are visible
    return json;
};

// Shipment Receipt (F1-SHIPMENT-RECEIPT-R1B). CUMULATIVE receipt against the live shipment_received_qty
// column; the backend derives shipments.status (partially_received / received) — never authored here.
// Payload (snake_case): { shipment_id (required), lines: [ { shipment_line_id, shipment_received_qty } ],
// actor? }. shipment_received_qty is the NEW CUMULATIVE total (not a per-save increment). Returns the FULL
// backend response { success, data?, error?, code?, invalid_lines? } WITHOUT throwing. Reloads the DB cache
// ONLY on success so On-the-Way immediately reflects the new receipt + derived status.
window.KM.DB.updateShipmentReceipt = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updateShipmentReceipt skipped');
        return { success: false, error: 'API not configured', code: 'config' };
    }
    var json;
    try {
        var resp = await fetch(OP_DB_API_BASE_URL, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(Object.assign({ action: 'shipment.receipt.update' }, payload))
        });
        if (!resp.ok) return { success: false, error: 'API returned ' + resp.status, code: 'network' };
        json = await resp.json();
    } catch (e) {
        return { success: false, error: (e && e.message) ? e.message : String(e), code: 'network' };
    }
    if (json && json.success) { await loadOperationDb({ force: true }); }
    return json;
};

// Shipment Route Progress (F1-SHIPMENT-RECEIPT-R1B). Set the CURRENT route point on the shipment's
// snapshotted shipment_routes nodes (forward-only; backward fails closed; same-node is an idempotent
// no-op). Payload (snake_case): { shipment_id (required), route_template_node_id (required — canonical
// node identity from this shipment's route), actor? }. Returns the FULL backend response WITHOUT throwing.
window.KM.DB.advanceShipmentRoutePoint = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, advanceShipmentRoutePoint skipped');
        return { success: false, error: 'API not configured', code: 'config' };
    }
    var json;
    try {
        var resp = await fetch(OP_DB_API_BASE_URL, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(Object.assign({ action: 'shipment.route.advance' }, payload))
        });
        if (!resp.ok) return { success: false, error: 'API returned ' + resp.status, code: 'network' };
        json = await resp.json();
    } catch (e) {
        return { success: false, error: (e && e.message) ? e.message : String(e), code: 'network' };
    }
    if (json && json.success) { await loadOperationDb({ force: true }); }
    return json;
};

// Shipment ETA update (F1-SHIPMENT-MAP-R10). Bounded canonical writer — updates ONLY shipments.eta.
// Payload (snake_case): { shipment_id (required), eta (YYYY-MM-DD, required), actor? }. Returns the FULL
// backend response WITHOUT throwing; force-reloads the cache on success so the drawer reflects DB truth.
window.KM.DB.updateShipmentEta = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updateShipmentEta skipped');
        return { success: false, error: 'API not configured', code: 'config' };
    }
    var json;
    try {
        var resp = await fetch(OP_DB_API_BASE_URL, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(Object.assign({ action: 'shipment.eta.update' }, payload))
        });
        if (!resp.ok) return { success: false, error: 'API returned ' + resp.status, code: 'network' };
        json = await resp.json();
    } catch (e) {
        return { success: false, error: (e && e.message) ? e.message : String(e), code: 'network' };
    }
    if (json && json.success) { await loadOperationDb({ force: true }); }
    return json;
};

// Backfill / migration: scan ALL existing marketplace_skus rows and create/update sku_regional_details.
// Creates missing regional rows and updates only site_sku + marketplace_product_id on existing rows;
// never touches compliance-document fields. Returns
// { created_count, updated_count, skipped_count, warning_count, errors, warnings }.
window.KM.DB.syncMarketplaceSkusToSkuRegionalDetails = async function() {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, syncMarketplaceSkusToSkuRegionalDetails skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'syncMarketplaceSkusToSkuRegionalDetails' })
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Sync regional details failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Weekly Shipping Plan (Decision Layer) write methods.
// Submit Plan → create shipping_plans + shipping_plan_lines (grouped server-side by the six-key).
window.KM.DB.createShippingPlansBatch = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, createShippingPlansBatch skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'createShippingPlansBatch' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Create shipping plans failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// ---- Weekly command reliability (Round C1) ----------------------------------------------------------
// ONE canonical command runner for the Weekly mutations. It fixes WRITE_SUCCEEDED_BUT_ACK_FAILED by
// DECOUPLING the acknowledgement from the readback: the command result is determined ONLY by the handler
// response, and the post-write readback is the PAGE's single responsibility (never coupled here, so a slow/
// failed reload can no longer flip a committed write into a displayed failure). Responses are read TEXT-FIRST
// and classified distinctly (HTTP_TRANSPORT_ERROR / NON_JSON_RESPONSE / BUSINESS_COMMAND_ERROR); a
// "cannot submit / already / not in state" business error maps to the idempotent-benign ALREADY_IN_TARGET_STATE.
// Returns a canonical { success, data, error } result and NEVER throws — callers check result.success.
var KM_ALREADY_IN_TARGET_PATTERNS = [
    /already/i, /cannot\s+(submit|approve|reject|cancel|complete)/i, /not\s+(a\s+)?(draft|pending|approved)/i,
    /must\s+be\s+(a\s+)?(draft|pending|approved)/i, /invalid\s+(status|transition)/i, /pending_approval/i,
    /no\s+longer/i, /current\s+status/i
];
function _kmClassifyBusinessError_(msg) {
    var s = String(msg == null ? '' : msg);
    for (var i = 0; i < KM_ALREADY_IN_TARGET_PATTERNS.length; i++) { if (KM_ALREADY_IN_TARGET_PATTERNS[i].test(s)) return 'ALREADY_IN_TARGET_STATE'; }
    return 'BUSINESS_COMMAND_ERROR';
}
// C2-D2A-UI: canonical business codes some handlers emit as the LEADING token of the error string
// (allocation-draft workflow). When present, surface the exact code so the UI maps state by code, never by
// parsing the message (§12). Weekly command errors do not start with these tokens, so C1 classification is unchanged.
var KM_CANONICAL_CODES = ['BLOCKED_CONFLICT', 'MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1', 'PLAN_HEADER_INCOMPLETE',
    'PLAN_LINE_INCOMPLETE', 'NO_ACTIVE_DRAFT', 'VERSION_CONFLICT', 'IMMUTABLE_TERMINAL_STATUS', 'SOURCE_AVAILABLE_QTY_EXCEEDED'];
function _kmExtractCanonicalCode_(msg) {
    var s = String(msg == null ? '' : msg).trim();
    for (var i = 0; i < KM_CANONICAL_CODES.length; i++) { if (s.indexOf(KM_CANONICAL_CODES[i]) === 0) return KM_CANONICAL_CODES[i]; }
    return '';
}
function _kmCmdOk_(command, data) { return { success: true, data: Object.assign({ command: command, committed: true }, data || {}), error: null }; }
function _kmCmdErr_(command, code, message, details) {
    return { success: false, data: null, error: { code: code || 'BUSINESS_COMMAND_ERROR', message: String(message == null ? code : message), details: (details == null ? { command: command } : Object.assign({ command: command }, details)) } };
}
async function _kmWeeklyCommand_(command, payload) {
    if (!isOperationDbApiConfigured()) return _kmCmdErr_(command, 'TRANSPORT_NOT_CONFIGURED', 'Operation DB API not configured');
    var url = (window.KM && window.KM.DB && typeof window.KM.DB.getApiBaseUrl === 'function' && window.KM.DB.getApiBaseUrl()) || OP_DB_API_BASE_URL;
    var resp;
    try {
        resp = await fetch(url, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(Object.assign({ action: command }, payload || {})) });
    } catch (netErr) {
        // Network/redirect failure with NO acknowledged response → transport error (not an ack of a commit).
        return _kmCmdErr_(command, 'HTTP_TRANSPORT_ERROR', 'Network error: ' + (netErr && netErr.message ? netErr.message : netErr));
    }
    var text = '';
    try { text = await resp.text(); } catch (e) { text = ''; }
    if (!resp.ok) return _kmCmdErr_(command, 'HTTP_TRANSPORT_ERROR', 'API HTTP ' + resp.status, { httpStatus: resp.status });
    var trimmed = String(text || '').trim();
    if (trimmed.charCodeAt(0) !== 123) return _kmCmdErr_(command, 'NON_JSON_RESPONSE', 'Non-JSON response from Web App', { snippet: trimmed.slice(0, 80) });   // 123 = open-brace char code (JSON object start)
    var json; try { json = JSON.parse(trimmed); } catch (pe) { return _kmCmdErr_(command, 'NON_JSON_RESPONSE', 'Malformed JSON response', { snippet: trimmed.slice(0, 80) }); }
    if (!json.success) {
        // R4J-LIVE7 §0/§3 — the gap-job family (START / CANCEL) returns a STRUCTURED envelope from gapBatchEnvelope_
        // ({ errors:[{ code, message, details }] }), while legacy handlers return a singular { error } string. Prefer
        // the structured code/message when present so a named START failure (CONTINUATION_SCHEDULE_FAILED /
        // GAP_JOB_LOCK_UNAVAILABLE / CALCULATION_CONTEXT_INVALID / GAP_JOB_START_ERROR …) is surfaced VERBATIM instead
        // of being flattened to a generic BUSINESS_COMMAND_ERROR. Falls back to the legacy path when there is no
        // errors[] (non-gap handlers), so their classification is unchanged.
        var _structured = (json.errors && json.errors[0]) ? json.errors[0] : null;
        var _emsg = _structured ? (_structured.message || _structured.code) : json.error;
        var _ecode = (_structured && _structured.code) || _kmExtractCanonicalCode_(json.error) || _kmClassifyBusinessError_(json.error);
        // Preserve the handler's structured data (e.g. conflictIds / stage detail) into error.details for the UI.
        return _kmCmdErr_(command, _ecode, _emsg || (command + ' failed'), (_structured && _structured.details) || ((json.data && typeof json.data === 'object') ? json.data : null));
    }
    return _kmCmdOk_(command, json.data);   // COMMITTED — the page performs the single readback via the active path
}

// Status transitions: { shipping_plan_id, transition: submit|approve|reject|cancel, rejected_reason?, actor? }.
// Returns the canonical C1 command result (never throws; no internal readback — the page reads back once).
window.KM.DB.updateShippingPlanStatus = function(payload) { return _kmWeeklyCommand_('updateShippingPlanStatus', payload); };
// Edit approved_qty (Draft only): { lines: [ { shipping_plan_line_id, approved_qty } ] }.
window.KM.DB.updateShippingPlanLineQty = function(payload) { return _kmWeeklyCommand_('updateShippingPlanLineQty', payload); };
// Append a note to shipping_plans.note (append-only history): { shipping_plan_id, note, actor? }.
window.KM.DB.appendShippingPlanNote = function(payload) { return _kmWeeklyCommand_('appendShippingPlanNote', payload); };
// Decision Layer Completion (Done): mark an Approved + transferred plan completed { shipping_plan_id, actor? }.
window.KM.DB.completeShippingPlan = function(payload) { return _kmWeeklyCommand_('completeShippingPlan', payload); };

// F1-4B-FM5 · Manual "Recalculate All Sites" batch commands. ONE browser request → ONE bounded server batch
// (enumerate scopes → reuse canonical calc per scope → UPSERT latest into the gap table). Never a per-SKU HTTP
// loop. Uses the canonical C1 command runner (text-first, transport/business classified, never throws). The
// page performs its own single readback of the materialized table; this runner never reloads the whole DB.
window.KM.DB.recalculateInventoryReplenishmentGapAll = function(payload) { return _kmWeeklyCommand_('inventoryReplenishmentGap.recalculate.all', payload || {}); };
window.KM.DB.recalculateOrderPlanningGapAll = function(payload) { return _kmWeeklyCommand_('orderPlanningGap.recalculate.all', payload || {}); };

// F1-4B-FM5-R4J · Backend-owned RESUMABLE gap job. START is a QUICK write: it enqueues ONE backend job (the server
// freezes the calc context, records Script-Property job state, and schedules the first self-re-arming continuation
// trigger) and returns immediately with { runId, status, scopesTotal }. It NEVER waits for the ~14-min calculation
// and NEVER re-POSTs the write. The backend then owns the job to terminal completion, independent of this browser
// tab (the user may refresh/close). STATUS is a strictly READ-ONLY poll of the job's Script-Property progress.
window.KM.DB.startInventoryReplenishmentGapJob = function(payload) { return _kmWeeklyCommand_('inventoryReplenishmentGap.job.start', payload || {}); };
window.KM.DB.startOrderPlanningGapJob = function(payload) { return _kmWeeklyCommand_('orderPlanningGap.job.start', payload || {}); };
// { product:'INVENTORY'|'ORDER_PLANNING', runId? } → { success, data:{ status, scopesProcessed, scopesTotal, ... } }.
window.KM.DB.getGapJobStatus = function(product, runId) { return _kmGapRead_('gapJob.status.get', { payload: { product: product, runId: runId || null } }); };
// F1-4B-FM5-R4J-LIVE4 · manual CANCEL (WRITE, exactly once per click): terminal CANCELLED for the active product job.
// Already-materialized rows are preserved (no rollback). runId optional (cancel only that run when supplied).
window.KM.DB.cancelInventoryReplenishmentGapJob = function(runId) { return _kmWeeklyCommand_('inventoryReplenishmentGap.job.cancel', { payload: { runId: runId || null } }); };
window.KM.DB.cancelOrderPlanningGapJob = function(runId) { return _kmWeeklyCommand_('orderPlanningGap.job.cancel', { payload: { runId: runId || null } }); };

// F1-4B-FM5-R1 · MATERIALIZED READ (page reads STORED gap rows; NO calculation, NO whole-DB reload). Bounded
// POST read of inventory_replenishment_gap / order_planning_gap for one scope. Text-first + fail-safe: on a
// transport/non-JSON/business failure returns { success:false, error } so the page can show a truthful state and
// NEVER silently fall back to a browser/live calculation. Returns { success, data:{ rows:[...] }, error }.
async function _kmGapRead_(action, payload) {
    if (!isOperationDbApiConfigured()) return { success: false, error: { code: 'TRANSPORT_NOT_CONFIGURED', message: 'Operation DB API not configured' } };
    var url = (window.KM && window.KM.DB && typeof window.KM.DB.getApiBaseUrl === 'function' && window.KM.DB.getApiBaseUrl()) || OP_DB_API_BASE_URL;
    var resp;
    try { resp = await fetch(url, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({ action: action }, payload || {})) }); }
    catch (netErr) { return { success: false, error: { code: 'HTTP_TRANSPORT_ERROR', message: 'Network error: ' + (netErr && netErr.message ? netErr.message : netErr) } }; }
    var text = ''; try { text = await resp.text(); } catch (e) { text = ''; }
    if (!resp.ok) return { success: false, error: { code: 'HTTP_TRANSPORT_ERROR', message: 'API HTTP ' + resp.status } };
    var trimmed = String(text || '').trim();
    if (trimmed.charCodeAt(0) !== 123) return { success: false, error: { code: 'NON_JSON_RESPONSE', message: 'Non-JSON response', snippet: trimmed.slice(0, 80) } };
    var json; try { json = JSON.parse(trimmed); } catch (pe) { return { success: false, error: { code: 'NON_JSON_RESPONSE', message: 'Malformed JSON response' } }; }
    if (!json.success) return { success: false, error: (json.errors && json.errors[0]) || { code: 'GAP_READ_ERROR', message: 'gap read failed' } };
    return { success: true, data: json.data || { rows: [] } };
}
// { company, country, marketplace, sku? } → { success, data:{ rows:[ inventory_replenishment_gap rows ] } }.
window.KM.DB.getInventoryReplenishmentGap = function(scope) { return _kmGapRead_('inventoryReplenishmentGap.get', { payload: { scope: scope || {} } }); };
// { company, country, marketplace, sku? } → { success, data:{ rows:[ order_planning_gap rows ] } }.
window.KM.DB.getOrderPlanningGap = function(scope) { return _kmGapRead_('orderPlanningGap.get', { payload: { scope: scope || {} } }); };
// F1-7E-PREREQ-5 · AI-Plan first-layer COMPOSER read (56_). payload { planning_cycle } → { success, data:{ planningCycle,
// windowMonths, rows:[ the SAME first-layer rows _buildRequestOrderRowsFromDb builds ] } }. READ ONLY; scoped composer
// (never getOperationDb); composes the 52_/53_/54_/55_ Layer-1 owners + identity. Layer-2 Gap/Recommendation unchanged.
window.KM.DB.getAiPlanFirstLayer = function(payload) { return _kmGapRead_('aiPlanFirstLayer.get', { payload: payload || {} }); };

// F1-4B-FM6-R4E2-B2 / R4E3-PRE — Request Order canonical draft: request-driven resumable scope job + scope
// read-back + LOCKED incremental order_qty edit. The browser drives ONE logical job (START → poll CONTINUE →
// terminal), reads the whole scope back once (getActive), and persists a single edited order_qty via the EXISTING
// locked decision writer (updateRecommendationDecisionLocked) under the optimistic-lock token — never a second writer.
window.KM.DB.startRequestOrderDraftJob = function(scope, opts) { return _kmWeeklyCommand_('requestOrderDraft.job.start', { payload: Object.assign({ scope: scope || {} }, opts || {}) }); };
window.KM.DB.continueRequestOrderDraftJob = function(runId) { return _kmWeeklyCommand_('requestOrderDraft.job.continue', { payload: { runId: runId || null } }); };
window.KM.DB.getRequestOrderDraftJobStatus = function(runId) { return _kmGapRead_('requestOrderDraft.job.status', { payload: { runId: runId || null } }); };
window.KM.DB.cancelRequestOrderDraftJob = function(runId) { return _kmWeeklyCommand_('requestOrderDraft.job.cancel', { payload: { runId: runId || null } }); };
// scope read-back (SKU omitted → { drafts, conflicts, noDraftSkus }). READ ONLY. { success, data:{...} }.
window.KM.DB.getActiveRequestOrderDrafts = function(scope) { return _kmGapRead_('requestOrderDraft.getActive', { payload: { scope: scope || {} } }); };
// canonical concurrency token for a draft (25_) → { success, data:{ expectedToken:{draft_version,userEditFingerprint} } }.
window.KM.DB.getRecommendationDraftToken = function(recommendationType, draftId) { return _kmWeeklyCommand_('getRecommendationDraftToken', { recommendationType: recommendationType, draftId: draftId }); };
// canonical LOCKED user-decision edit (25_). payload: { recommendationType, draftId, edits:[{naturalKey,fields}], expectedToken, actor? }.
window.KM.DB.updateRecommendationDecisionLocked = function(payload) { return _kmWeeklyCommand_('updateRecommendationDecisionLocked', payload || {}); };

// ADMIN-AUTOMATION-R1 · Automation Schedule Settings. GET is read-only (opening the Admin page mutates nothing);
// UPDATE writes the Script-Property config + reconciles ONLY the owned time trigger, then returns the normalized
// config + trigger status. Both use the canonical text-first runners (never throw; transport/business classified).
window.KM.DB.getAutomationSchedule = function() { return _kmGapRead_('automationSchedule.get', {}); };
// UPDATE uses the same text-first POST runner as the reads so the server's structured `errors[0]` (e.g.
// WEEKLY_RECOMMENDATION_NOT_AVAILABLE / INVALID_TIME) surfaces as { success:false, error:{ code } } and the
// success path returns the server's post-reconcile readback in `data` (jobs + trigger status + warnings).
window.KM.DB.updateAutomationSchedule = function(payload) { return _kmGapRead_('automationSchedule.update', { payload: payload || {} }); };

// ---- Weekly Plan Layer-1/2 + Combined Plan + Method Recommendation adapters (2026-07-28) ----
// All matching is CODE/ID based server-side. Weekly Plan NEVER persists rate_card_id; carrier_name is
// resolved live (KM.display.carrierName). READ helpers do not force a DB reload; WRITE helpers do.
async function _kmShippingPost_(action, payload, errMsg, reloadAfter) {
    if (!isOperationDbApiConfigured()) { console.warn('[KM.DB] API not configured, ' + action + ' skipped'); return { success: false, error: 'API not configured' }; }
    var resp = await fetch(OP_DB_API_BASE_URL, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: action }, payload)) });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || errMsg);
    if (reloadAfter) await loadOperationDb({ force: true });
    return json.data;
}
// READ: Execution Plan method recommendation + Weekly L1 cascade { origin_country?, destination_country|country, planning_date?, skus?, shipping_method?, last_mile_delivery? }.
window.KM.DB.getShippingMethodCandidates = function(payload) { return _kmShippingPost_('getShippingMethodCandidates', payload, 'Get method candidates failed', false); };
// READ: Weekly L2 rough rate candidates for a plan { shipping_plan_id }.
window.KM.DB.getWeeklyPlanRateCandidates = function(payload) { return _kmShippingPost_('getWeeklyPlanRateCandidates', payload, 'Get rate candidates failed', false); };
// WRITE: Weekly L1 rationale (clears carrier/cost, bumps version) { shipping_plan_id, shipping_method?, last_mile_delivery?, customs_type?, ... }.
window.KM.DB.updateShippingPlanRationale = function(payload) { return _kmShippingPost_('updateShippingPlanRationale', payload, 'Update rationale failed', true); };
// WRITE: Weekly L2 carrier select (snapshot + cost; NO rate_card_id) { shipping_plan_id, selected_rate_card_id }.
window.KM.DB.selectShippingPlanCarrier = function(payload) { return _kmShippingPost_('selectShippingPlanCarrier', payload, 'Select carrier failed', true); };
// WRITE: create a Combined Parent over eligible Draft plans { source_plan_ids: [...] }.
window.KM.DB.combineShippingPlans = function(payload) { return _kmShippingPost_('combineShippingPlans', payload, 'Combine plans failed', true); };
// WRITE: dissolve a Combined Parent { parent_shipping_plan_id }.
window.KM.DB.uncombineShippingPlans = function(payload) { return _kmShippingPost_('uncombineShippingPlans', payload, 'Uncombine plans failed', true); };

// Execution Commit (explicit / retry): Approved shipping_plan → shipments + shipment_lines (draft).
// Normally Approve auto-creates the Shipment Draft server-side; this is the idempotent retry path.
// { shipping_plan_id, actor? }
window.KM.DB.createShipmentFromPlan = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, createShipmentFromPlan skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'createShipmentFromPlan' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Create shipment failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Edit EXECUTION-layer fields only (carrier/container/booking/ETD/ETA/tracking/remark/...).
// The Execution Snapshot and six-key context are immutable and rejected server-side.
// { shipment_id, carrier_id?, container_no?, booking_no?, bl_no?, invoice_no?, tracking_number?,
//   etd?, eta?, note?, status?, actor? }
window.KM.DB.updateShipment = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updateShipment skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'updateShipment' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Update shipment failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// ========================================
// Procurement Layer (Phase 1) writers — API-ready. All POST { action, ...payload } and reload
// the DB on success (same pattern as the shipping-plan / shipment writers). The frontend never
// treats the DOM as the source of truth; sessionStorage is demo fallback / draft recovery only.
// ========================================

// Create a Request Order Draft (Procurement Planning Draft). Body:
// { company?, supplier_id?, supplier_name?, factory_id?, warehouse_id?, source?, currency?,
//   note?, created_by?, lines: [ { sku, product_name?, series?, requested_qty, units_per_carton?,
//   supplier_sku?, unit_cost?, need_reason?, related_entity_type?, related_entity_id? } ] }
window.KM.DB.createRequestOrderDraft = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, createRequestOrderDraft skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'createRequestOrderDraft' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Create request order failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// ---- Request Order second-layer allocation drafts (planning scratchpads; no stock movement) ----
// Upsert ONE draft header (CANONICAL fields). { request_allocation_draft_id?, planning_cycle?, company?,
//   country?, marketplace?, sku?, category_snapshot?, series_snapshot?, status?, generation_type?,
//   draft_purpose?, draft_version?, created_by?, note? } → { request_allocation_draft_id }.
//   (generation_type replaces the retired source_type; category/series are legacy read-only aliases.)
window.KM.DB.upsertRequestOrderAllocationDraft = async function(payload) {
    if (!isOperationDbApiConfigured()) { console.warn('[KM.DB] API not configured, upsertRequestOrderAllocationDraft skipped'); return { success: false, error: 'API not configured' }; }
    var resp = await fetch(OP_DB_API_BASE_URL, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'upsertRequestOrderAllocationDraft' }, payload)) });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert allocation draft failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Round 1H — read-only concurrency-token getter for a Recommendation Draft. Returns
// { success, data:{ expectedToken:{draft_version,userEditFingerprint}, status } }.
window.KM.DB.getRecommendationDraftToken = async function(recommendationType, draftId) {
    if (!isOperationDbApiConfigured()) { return { success: false, error: 'API not configured' }; }
    var resp = await fetch(OP_DB_API_BASE_URL, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'getRecommendationDraftToken', recommendationType: recommendationType, draftId: draftId }) });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    return await resp.json();
};

// Persist the lines of ONE draft. { request_allocation_draft_id, lines: [ ... ] } → { line_count }.
// Round 1H: this now hits the LOCKED, terminal-guarded, optimistic-concurrency write boundary. It performs a
// read-before-write: if the caller did not supply an expectedToken, the current Draft token is fetched and
// attached, so a concurrent edit that changed the Draft since it was read surfaces as a CONFLICT (never a
// silent overwrite). The recommended_qty snapshot + user decisions are preserved server-side.
window.KM.DB.upsertRequestOrderAllocationDraftLines = async function(payload) {
    if (!isOperationDbApiConfigured()) { console.warn('[KM.DB] API not configured, upsertRequestOrderAllocationDraftLines skipped'); return { success: false, error: 'API not configured' }; }
    if (payload && payload.expectedToken === undefined && payload.request_allocation_draft_id) {
        try {
            var tok = await window.KM.DB.getRecommendationDraftToken('MONTHLY_ORDER', payload.request_allocation_draft_id);
            if (tok && tok.success && tok.data && tok.data.expectedToken) payload = Object.assign({}, payload, { expectedToken: tok.data.expectedToken });
        } catch (e) { /* token fetch failed → the server fails closed with a CONFLICT (concurrency never silently disabled) */ }
    }
    var resp = await fetch(OP_DB_API_BASE_URL, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'upsertRequestOrderAllocationDraftLines' }, payload)) });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error((json.data && json.data.reason) || json.error || 'Upsert allocation draft lines failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Mark drafts submitted. { draft_ids: [ ... ], submitted_by? } → { submitted }.
window.KM.DB.submitRequestOrderAllocationDrafts = async function(payload) {
    if (!isOperationDbApiConfigured()) { console.warn('[KM.DB] API not configured, submitRequestOrderAllocationDrafts skipped'); return { success: false, error: 'API not configured' }; }
    var resp = await fetch(OP_DB_API_BASE_URL, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'submitRequestOrderAllocationDrafts' }, payload)) });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Submit allocation drafts failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// --- Inventory Replenishment second-layer Recommendation / Execution Plan drafts (16_ handlers).
// Backend handler/table = source-complete (assets/specs/active/apps-script/16_shipping_allocation_handlers.gs);
// LIVE persistence activates on an authorized redeploy. Until then these return {success:false} when the
// API is unconfigured and the UI falls back to transient sessionStorage recovery (never SSOT).
// C2-D2: Allocation-Draft Save/Cancel adapters aligned to the C1 canonical command runner (_kmWeeklyCommand_):
// ack decoupled from readback, structured error codes (HTTP_TRANSPORT_ERROR / NON_JSON_RESPONSE /
// BUSINESS_COMMAND_ERROR / ALREADY_IN_TARGET_STATE / TRANSPORT_NOT_CONFIGURED), NEVER throws, and NO internal
// whole-DB loadOperationDb — the page performs exactly one targeted readback via getShippingAllocationDraftWorkspace.
window.KM.DB.upsertShippingAllocationDraft = function(payload) { return _kmWeeklyCommand_('upsertShippingAllocationDraft', payload); };
// UPSERT lines by allocation_draft_line_id (protects recommended_qty; §D). { allocation_draft_id, lines }.
window.KM.DB.upsertShippingAllocationDraftLines = function(payload) { return _kmWeeklyCommand_('upsertShippingAllocationDraftLines', payload); };
window.KM.DB.submitShippingAllocationDrafts = function(payload) { return _kmWeeklyCommand_('submitShippingAllocationDrafts', payload); };
// C2-D2 §13: whole-Draft Cancel (soft-cancel; idempotent — repeat returns benign already-cancelled).
window.KM.DB.cancelShippingAllocationDraft = function(payload) { return _kmWeeklyCommand_('cancelShippingAllocationDraft', payload); };
// C2-D2 §9: targeted READ-ONLY Allocation-Draft readback — reads ONLY the two draft tables server-side (never
// getOperationDb). Text-first classification; never throws. Returns { success, data:{status, draft, lines, issues}, errors }.
window.KM.DB.getShippingAllocationDraftWorkspace = async function(params) {
    if (!isOperationDbApiConfigured()) { return { success: false, data: null, error: { code: 'TRANSPORT_NOT_CONFIGURED', message: 'API not configured' } }; }
    var url = (window.KM && window.KM.DB && typeof window.KM.DB.getApiBaseUrl === 'function' && window.KM.DB.getApiBaseUrl()) || OP_DB_API_BASE_URL;
    var resp;
    try { resp = await fetch(url, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({ action: 'getShippingAllocationDraftWorkspace' }, params || {})) }); }
    catch (netErr) { return { success: false, data: null, error: { code: 'HTTP_TRANSPORT_ERROR', message: String((netErr && netErr.message) || netErr) } }; }
    var text = ''; try { text = await resp.text(); } catch (e) { text = ''; }
    if (!resp.ok) return { success: false, data: null, error: { code: 'HTTP_TRANSPORT_ERROR', message: 'API HTTP ' + resp.status, details: { httpStatus: resp.status } } };
    var trimmed = String(text || '').trim();
    if (trimmed.charCodeAt(0) !== 123) return { success: false, data: null, error: { code: 'NON_JSON_RESPONSE', message: trimmed.slice(0, 120) } };
    var json; try { json = JSON.parse(trimmed); } catch (pe) { return { success: false, data: null, error: { code: 'NON_JSON_RESPONSE', message: 'parse error' } }; }
    return json;
};

// Batch upsert Site Confirmations. { confirmations: [ { planning_cycle, company, country,
//   marketplace, series, bucket, status?, note? } ], confirmed_by? } → { upserted, created, updated }.
// Records site-level approval only — does NOT create request_orders (Confirm Site ≠ Send Request).
window.KM.DB.upsertRequestOrderSiteConfirmations = async function(payload) {
    if (!isOperationDbApiConfigured()) { console.warn('[KM.DB] API not configured, upsertRequestOrderSiteConfirmations skipped'); return { success: false, error: 'API not configured' }; }
    var resp = await fetch(OP_DB_API_BASE_URL, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'upsertRequestOrderSiteConfirmations' }, payload)) });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert site confirmations failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// ---- Carrier Rate Card v1 — Template Export (client-side) + Import (append-only server write) ----

// Fixed columns the carrier must NOT edit (route/method/charge structure identity).
window.KM.DB.CARRIER_RATE_TEMPLATE_FIXED_COLS = [
    'carrier_id', 'carrier_name', 'origin_country', 'origin_city', 'destination_country', 'destination_city',
    'destination_postal_code_start', 'destination_postal_code_end', 'destination_warehouse_code',
    'marketplace', 'shipping_method', 'last_mile_delivery', 'charge_type', 'charge_unit', 'dim_divisor',
    'min_box_weight', 'min_box_weight_unit', 'weight_tier', 'weight_tier_unit', 'currency',
    'transit_type', 'battery_type', 'customs_type'
];
// Carrier-editable columns on EXISTING rows (Update Template §4C.3A). Server (17_) enforces this set;
// min_charge is LOCKED on existing rows (kept off this list on purpose).
window.KM.DB.CARRIER_RATE_TEMPLATE_EDITABLE_COLS = [
    'unit_rate', 'effective_from', 'effective_to', 'fuel_surcharge', 'customs_fee', 'doc_fee', 'status', 'note'
];
// Full template column order. `row_type` + `rate_card_id` first (helpers/identity). rate_card_id present =
// existing row (update); blank = new row (create). `row_type` is NOT persisted. NO Lead Time / transit_days.
window.KM.DB.CARRIER_RATE_TEMPLATE_COLS = ['row_type', 'rate_card_id'].concat(
    window.KM.DB.CARRIER_RATE_TEMPLATE_FIXED_COLS.slice(0, 20),   // through currency (structure; incl. last_mile_delivery)
    ['unit_rate', 'min_charge', 'fuel_surcharge', 'customs_fee', 'doc_fee'],
    ['transit_type', 'battery_type', 'customs_type', 'shipping_method_label', 'note', 'effective_from', 'effective_to', 'status']
);

// Build + download a Carrier Rate Template CSV from already-loaded rate-card rows (normalized).
// Two modes (opts.mode):
//   'update' (default) — weekly/monthly rate update: fixed route/method fields kept; the editable
//                        pricing/date fields unit_rate / effective_from / effective_to are CLEARED so the
//                        carrier only fills the new numbers.
//   'master'           — one-time full import / new-route setup: ALL columns exported WITH their current
//                        values (nothing cleared) so the user can edit any field and add new
//                        carrier / shipping_method / last_mile_delivery / warehouse / city / zip / country rows.
// Both modes include last_mile_delivery and NEVER include Lead Time / transit_days (those live in carrier_lead_times).
// Returns { rows, filename, mode }.
window.KM.DB.exportCarrierRateTemplate = function(rows, opts) {
    opts = opts || {};
    var mode = (opts.mode === 'master') ? 'master' : 'update';
    var cols = window.KM.DB.CARRIER_RATE_TEMPLATE_COLS;
    var carriers = (window.KM.DB.getCarriers && window.KM.DB.getCarriers()) || [];
    var nameById = {};
    carriers.forEach(function(c) { if (c.carrierId) nameById[c.carrierId] = c.carrierName; });
    function esc(v) {
        var s = String(v == null ? '' : v);
        return (/[",\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    // One example row (ignored on import). Master mode notes it is fully editable / new rows allowed.
    var example = {
        row_type: 'example', rate_card_id: '', carrier_id: 'CARRIER-EXAMPLE', carrier_name: 'Example Forwarder',
        origin_country: 'CN', origin_city: 'Shenzhen', destination_country: 'US', destination_city: 'Los Angeles',
        destination_postal_code_start: '', destination_postal_code_end: '', destination_warehouse_code: 'ONT8',
        marketplace: 'Amazon', shipping_method: 'Sea', last_mile_delivery: 'Parcel', charge_type: 'weight', charge_unit: 'kg',
        dim_divisor: '6000', min_box_weight: '', min_box_weight_unit: 'kg', weight_tier: '100', weight_tier_unit: 'kg',
        currency: 'USD', unit_rate: '3.50', min_charge: '150', fuel_surcharge: '', customs_fee: '', doc_fee: '',
        transit_type: 'door_to_door', battery_type: 'no_battery', customs_type: 'tax_refund_export',
        note: (mode === 'master'
            ? 'EXAMPLE ROW — ignored on import. MASTER template: every field is editable; add new carrier / shipping_method / last_mile_delivery / warehouse / city / zip / country rows below.'
            : 'EXAMPLE ROW — ignored on import'),
        effective_from: '2026-08-01', effective_to: '2026-12-31', status: 'active'
    };
    var master = (mode === 'master');
    var dataRows = (rows || []).map(function(r) {
        return {
            row_type: 'data',
            rate_card_id: r.rateCardId || '',   // present → existing row (update); blank → new row (create)
            carrier_id: r.carrierId, carrier_name: nameById[r.carrierId] || r.carrierName || '',
            origin_country: r.originCountry, origin_city: r.originCity,
            destination_country: r.destinationCountry, destination_city: r.destinationCity,
            destination_postal_code_start: r.destinationPostalCodeStart, destination_postal_code_end: r.destinationPostalCodeEnd,
            destination_warehouse_code: r.destinationWarehouseCode, marketplace: r.marketplace,
            shipping_method: r.shippingMethod, last_mile_delivery: r.lastMileDelivery, charge_type: r.chargeType, charge_unit: r.chargeUnit,
            dim_divisor: r.dimDivisor, min_box_weight: r.minBoxWeight, min_box_weight_unit: r.minBoxWeightUnit,
            weight_tier: r.weightTier, weight_tier_unit: r.weightTierUnit, currency: r.currency,
            // Update mode CLEARS the editable rate/date fields; master mode KEEPS existing values.
            unit_rate: master ? (r.unitRate != null ? r.unitRate : '') : '',
            min_charge: r.minCharge, fuel_surcharge: r.fuelSurcharge, customs_fee: r.customsFee, doc_fee: r.docFee,
            transit_type: r.transitType, battery_type: r.batteryType, customs_type: r.customsType,
            note: r.note,
            effective_from: master ? (r.effectiveFrom || '') : '',
            effective_to: master ? (r.effectiveTo || '') : '',
            status: r.status || 'active'
        };
    });
    var all = [example].concat(dataRows);
    var lines = [cols.join(',')].concat(all.map(function(row) { return cols.map(function(c) { return esc(row[c]); }).join(','); }));
    var csv = lines.join('\r\n');
    var filename = opts.filename || ('carrier_rate_' + mode + '_template_' + new Date().toISOString().slice(0, 10) + '.csv');
    try {
        var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename; document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { console.warn('[KM.DB] exportCarrierRateTemplate download failed:', e); }
    return { rows: all.length, filename: filename, mode: mode };
};

// Append-only import of parsed template rows → carrier_rate_cards (server-side validation).
// payload = { rows: [ {row_type, carrier_id, ...} ], columns?: [headers], source_file_name? }.
// Returns { imported, skipped_examples, rejected, batch_id, errors:[{row,message}] }; reloads DB.
window.KM.DB.importCarrierRateTemplate = async function(payload) {
    if (!isOperationDbApiConfigured()) { console.warn('[KM.DB] API not configured, importCarrierRateTemplate skipped'); return { success: false, error: 'API not configured' }; }
    var resp = await fetch(OP_DB_API_BASE_URL, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'importCarrierRateCards' }, payload)) });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Import carrier rate cards failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Request Order status transitions: { request_order_id, transition: submit|approve|reject|cancel|done,
//   rejected_reason?, actor? }. reject → draft (version +1 on resubmit); done sets completed_* (Approved only).
window.KM.DB.updateRequestOrderStatus = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updateRequestOrderStatus skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'updateRequestOrderStatus' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Update request order status failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Edit request_order_lines (Draft only). Each line: { request_order_line_id, approved_qty?,
//   inspection_date?, expected_ready_date?, expected_ship_date?, note? }. Recomputes carton/est.
window.KM.DB.updateRequestOrderLineQty = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updateRequestOrderLineQty skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'updateRequestOrderLineQty' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Update request order line qty failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Cancel a tier/block by STATUS (soft): { request_order_line_ids: [ ... ], actor? }. Sets each line's
// line_status='cancelled'; if a parent request has no active line left, its status → cancelled.
window.KM.DB.cancelRequestOrderTier = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, cancelRequestOrderTier skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'cancelRequestOrderTier' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Cancel request order tier failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Convert an Approved Request Order into a Purchase Order (Procurement Commitment):
// { request_order_id, actor? }. Copies request → PO + lines; sets request status=converted_to_po.
window.KM.DB.createPurchaseOrderFromRequest = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, createPurchaseOrderFromRequest skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'createPurchaseOrderFromRequest' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Create purchase order failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Purchase Order status transitions: { purchase_order_id, transition: issue|confirm|start_production|
//   ready_to_ship|complete|cancel, actor?, expected_ready_date?, confirmed_ready_date?, note? }.
window.KM.DB.updatePurchaseOrderStatus = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updatePurchaseOrderStatus skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'updatePurchaseOrderStatus' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Update purchase order status failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Edit purchase_order_lines fields (e.g. ordered_qty / unit_cost / note): { lines: [ { purchase_order_line_id, ordered_qty?, unit_cost?, note? } ] }.
window.KM.DB.updatePurchaseOrderLine = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updatePurchaseOrderLine skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'updatePurchaseOrderLine' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Update purchase order line failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Edit PO Overview execution HEADER fields on purchase_orders (by purchase_order_id):
//   { purchase_order_id, inspection_date?, expected_completion_date?, expected_ship_date?, deposit_due_date?, note?,
//     deposit_amount?, balance_amount?, paid_amount?, payment_status?, actor? }.
// Writes purchase_orders only (never request_orders / lines). Dates saved date-only. supplier_*_ready_date
// are NOT touched here.
window.KM.DB.updatePurchaseOrderHeader = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updatePurchaseOrderHeader skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'updatePurchaseOrderHeader' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Update purchase order header failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// PO Workspace Receive flow: receive produced/received qty against purchase_order_lines.
//   { purchase_order_id, lines: [ { purchase_order_line_id, receive_qty } ], actor? }.
// Per line completed_qty += receive_qty (clamped to remaining), remaining_qty = ordered − completed;
// PO order_status recomputed to completed / partial_completed. Writes purchase_orders /
// purchase_order_lines ONLY (never request orders / shipments / inventory / factory stock).
window.KM.DB.receivePurchaseOrderLines = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, receivePurchaseOrderLines skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'receivePurchaseOrderLines' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Receive purchase order lines failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// ========================================
// FC Summary write path (Phase 1) — Special Events + Target % Rules.
// upsert = create when id missing, update when id present. delete = hard delete by id.
// All reload the Operation DB on success (getFcSpecialEvents / getFcTargetRules then reflect it).
// ========================================

// { event_id?, company, country, marketplace, scope_type?, scope_id?, sku, series?, category?,
//   event_name, event_period?, event_month?, year?, fc_qty, note?, actor? }
// Campaign header upsert (Special Event Builder step 1). Idempotent by campaign_id, else by
// company|country|marketplace|campaign_name|year. Returns { campaign_id, created }.
// { campaign_id?, company, marketplace_id?, campaign_name, country, marketplace, promotion_type?,
//   event_flag?, year?, start_date?, end_date?, status?, source? }
window.KM.DB.upsertCampaign = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, upsertCampaign skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'upsertCampaign' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert campaign failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Campaign SKU lines batch upsert (step 2). Idempotent per line by campaign_sku_line_id, else
// campaign_id + marketplace_sku_id (or + sku). { campaign_id, lines:[...] } → { lines:[{campaign_sku_line_id,sku,created}] }.
window.KM.DB.upsertCampaignSkuLines = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, upsertCampaignSkuLines skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'upsertCampaignSkuLines' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert campaign_sku_lines failed');
    await loadOperationDb({ force: true });
    return json.data;
};

window.KM.DB.upsertFcSpecialEvent = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, upsertFcSpecialEvent skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'upsertFcSpecialEvent' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert special event failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Batch upsert of special-event forecasts (Special-Event inline edit). One request; reloads on success.
// payload rows: [{ event_fc_id, campaign_id, event_name, sku, fc_qty }]
window.KM.DB.importFcSpecialEventsBatch = async function(rows, options) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, importFcSpecialEventsBatch skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'importFcSpecialEventsBatch', rows: rows || [], options: options || {} })
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (json && json.success) { await loadOperationDb({ force: true }); }
    return json;
};

// { event_id }
window.KM.DB.deleteFcSpecialEvent = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, deleteFcSpecialEvent skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'deleteFcSpecialEvent' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Delete special event failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// { target_rule_id?, company?, country?, marketplace?, scope_type, scope_id, year?, category?,
//   series?, sku?, target_percentage?, jan_pct..dec_pct, note?, actor? }
window.KM.DB.upsertFcTargetRule = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, upsertFcTargetRule skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'upsertFcTargetRule' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Upsert target rule failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// { target_rule_id }
window.KM.DB.deleteFcTargetRule = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, deleteFcTargetRule skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'deleteFcTargetRule' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Delete target rule failed');
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

window.KM.DB.importFcRegularForecastBatch = async function(rows, options) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, importFcRegularForecastBatch skipped');
        return { success: false, error: 'API not configured' };
    }
    var opts = Object.assign({ forecastStatusDefault: 'draft', sourceDefault: 'import' }, options || {});
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: 'importFcRegularForecastBatch',
            rows: rows || [],
            options: opts
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
// overseas_inventory_snapshot / movements Write Methods
// ========================================

window.KM.DB.importOverseasInventorySnapshotBatch = async function(rows, options) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, importOverseasInventorySnapshotBatch skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: 'importOverseasInventorySnapshotBatch',
            rows: rows || [],
            options: options || {}
        })
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (json && json.success) {
        await loadOperationDb({ force: true });
    }
    return json;
};

window.KM.DB.adjustOverseasInventory = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, adjustOverseasInventory skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'adjustOverseasInventory' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (json && json.success) {
        await loadOperationDb({ force: true });
    }
    return json;
};

// Factory Inventory Adjustment (2026-07-23). Writes factory_stock (fac_current_stock only) + one
// factory_stock_movements row atomically on the backend. Frontend sends the NEW available only;
// the backend computes qty and generates all ids/timestamps. On success the DB cache is reloaded
// so the snapshot + movement log re-render from the real tables (never a front-end-only patch).
window.KM.DB.adjustFactoryInventory = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, adjustFactoryInventory skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'adjustFactoryInventory' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (json && json.success) {
        await loadOperationDb({ force: true });
    }
    return json;
};

// ========================================
// F0-HOTFIX-FI1 — Factory Inventory Initial Stock Import (SET_CURRENT_STOCK).
// Two decoupled actions: validate (server-computed preview; ZERO writes) and commit (atomic write). Neither
// auto-reloads the whole Operation DB — the ACK is decoupled from the READBACK (§16). After a committed ack
// the page calls refreshFactoryStockTables() (a TARGETED per-table GET, never a whole-DB reload).
// ========================================
window.KM.DB.factoryInventoryImportValidate = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, factoryInventoryImportValidate skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'factoryInventory.import.validate' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    return await resp.json();   // preview only — NO cache reload (read-only validate)
};

window.KM.DB.factoryInventoryImportCommit = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, factoryInventoryImportCommit skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'factoryInventory.import.commit' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    // Decoupled: return the commit ACK verbatim. The caller performs a targeted readback separately, so a
    // readback failure never masks a committed write and never triggers a blind resend.
    return await resp.json();
};

// TARGETED readback (§16) — re-GET ONLY factory_stock + factory_stock_movements and patch the in-memory
// cache in place. Never loadOperationDb({force:true}) (no whole-DB reload). Throws on fetch failure so the
// caller can show "Import committed. Reconfirming Factory Inventory…" without resending the commit.
window.KM.DB.refreshFactoryStockTables = async function() {
    if (!isOperationDbApiConfigured()) return { success: false, error: 'API not configured' };
    var stockRows = await getOperationDbTableFromSheet('factory_stock');
    var movementRows = await getOperationDbTableFromSheet('factory_stock_movements');
    if (!window._opDbCache) window._opDbCache = {};
    window._opDbCache.factoryStock = (stockRows || []).map(normalizeFactoryStockRecord).filter(function(r) { return r.factoryStockId || r.sku; });
    window._opDbCache.factoryStockMovements = (movementRows || []).map(normalizeFactoryStockMovementRecord).filter(function(r) { return r.movementId || r.sku; });
    return { success: true, factoryStock: window._opDbCache.factoryStock.length, factoryStockMovements: window._opDbCache.factoryStockMovements.length };
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
    console.log('marketplaces count:', (window._opDbCache.marketplaces || []).length);
    console.log('marketplace_skus count:', (window._opDbCache.marketplaceSkus || []).length);
    console.log('pricing_list count:', (window._opDbCache.pricingList || []).length);
    console.log('pricing_change_log count:', (window._opDbCache.pricingChangeLog || []).length);
    console.log('fc_regular_forecast count:', (window._opDbCache.fcRegularForecast || []).length);
    console.log('factory_stock count:', (window._opDbCache.factoryStock || []).length);
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
    // F1-S1: lifecycle authority = sku_details.lifecycle (no browser override).
    console.log('2. Lifecycle (sku_details authority):', dbItem.lifecycle || 'none');
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
