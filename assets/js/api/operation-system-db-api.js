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

        // --- Customs / price (value + unit) ---
        hsCode: s(r.hscode),
        declaredValue: s(r.declared_value), declaredValueUnit: s(r.declared_value_unit),
        minimumPrice: s(r.minimum_price), minimumPriceUnit: s(r.minimum_price_unit),
        msrp: s(r.msrp), msrpUnit: s(r.msrp_unit),
        sellingPrice: s(r.selling_price), sellingUnit: s(r.selling_unit),

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
        marketplaceId: String(r.marketplace_id || '').trim(),
        company: String(r.company || '').trim(),
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
        // Fulfillment model (SKU-level override). Empty when the column is absent — the
        // marketplace-level model then applies. Values: platform_fulfilled | self_fulfilled | hybrid.
        fulfillmentModel: String(r.fulfillment_model || '').trim(),
        launchDate: String(r.launch_date || '').trim(),
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        raw: r
    };
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
        currentStock: parseFloat(r.current_stock) || 0,
        createdAt: String(r.created_at || '').trim(),
        updatedAt: String(r.updated_at || '').trim(),
        lastTransactionAt: String(r.last_transaction_at || '').trim(),
        raw: r
    };
}

function normalizeFactoryStockMovementRecord(raw) {
    var r = raw || {};
    // Actual factory_stock_movements schema:
    //   factory_stock_movement_id, sku, warehouse_id, movement_type, qty,
    //   related_entity_type, related_entity_id, before_qty, after_qty, note, created_by, created_at
    // Read those exact columns; older alias names kept only as defensive fallbacks.
    return {
        movementId: String(r.factory_stock_movement_id || r.movement_id || '').trim(),
        warehouseId: String(r.warehouse_id || '').trim(),
        factoryName: String(r.factory_name || '').trim(),
        sku: String(r.sku || '').trim(),
        movementType: String(r.movement_type || '').trim(),
        quantity: parseFloat(r.qty != null && r.qty !== '' ? r.qty : r.quantity) || 0,
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

function normalizeWarehouseRecord(raw) {
    var r = raw || {};
    return {
        warehouseId: String(r.warehouse_id || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        warehouseName: String(r.warehouse_name || '').trim(),
        warehouseType: String(r.warehouse_type || '').trim(),
        // Optional: surfaced for Movement Log marketplace filter. Empty if the sheet has no such column.
        marketplace: String(r.marketplace || '').trim(),
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
        warehouseId: String(r.warehouse_id || '').trim(),
        sku: String(r.sku || '').trim(),
        siteSku: String(r.site_sku || '').trim(),
        physicalStock: parseFloat(r.physical_stock) || 0,
        availableStock: parseFloat(r.available_stock) || 0,
        reservedStock: parseFloat(r.reserved_stock) || 0,
        damagedStock: parseFloat(r.damaged_stock) || 0,
        onTheWayQty: parseFloat(r.on_the_way_qty) || 0,
        onTheWayEta: String(r.on_the_way_eta || '').trim(),
        onTheWayBucket: String(r.on_the_way_bucket || '').trim(),
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
        quantity: parseFloat(r.quantity) || 0,
        quantityBefore: parseFloat(r.quantity_before) || 0,
        quantityAfter: parseFloat(r.quantity_after) || 0,
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

function normalizeFcSpecialEventRecord(raw) {
    var r = raw || {};
    return {
        eventId: String(r.event_id || r.special_event_id || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        scopeType: String(r.scope_type || '').trim().toLowerCase(),
        scopeId: String(r.scope_id || '').trim(),
        sku: String(r.sku || '').trim(),
        series: String(r.series || '').trim(),
        category: String(r.category || '').trim(),
        event: String(r.event || r.event_name || '').trim(),
        eventPeriod: String(r.event_period || r.period || '').trim(),
        eventMonth: String(r.event_month || r.month || '').trim(),
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
        destination: String(r.destination || '').trim(),
        shippingMethod: String(r.shipping_method || '').trim(),
        planVersion: parseFloat(r.plan_version) || 1,
        parentShippingPlanId: String(r.parent_shipping_plan_id || '').trim(),
        submitBatchId: String(r.submit_batch_id || '').trim(),
        batchStatus: String(r.batch_status || '').trim(),
        carrierId: String(r.carrier_id || '').trim(),
        estimatedFreightCost: parseFloat(r.estimated_freight_cost) || 0,
        estimatedDuty: parseFloat(r.estimated_duty) || 0,
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
        requestedQty: parseFloat(r.requested_qty) || 0,
        approvedQty: parseFloat(r.approved_qty) || 0,
        cartonQty: parseFloat(r.carton_qty) || 0,
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

// Shipment (Execution Layer) header. Execution Snapshot lives on the lines (see below).
function normalizeShipmentRecord(raw) {
    var r = raw || {};
    return {
        shipmentId: String(r.shipment_id || '').trim(),
        shipmentNo: String(r.shipment_no || '').trim(),
        shippingPlanId: String(r.shipping_plan_id || '').trim(),
        referenceId: String(r.reference_id || '').trim(),
        warehouseId: String(r.warehouse_id || '').trim(),
        warehouseCode: String(r.warehouse_code || '').trim(),
        company: String(r.company || '').trim(),
        country: String(r.country || '').trim(),
        marketplace: String(r.marketplace || '').trim(),
        shipFrom: String(r.ship_from || '').trim(),
        destination: String(r.destination || '').trim(),
        carrierId: String(r.carrier_id || '').trim(),
        rateCardId: String(r.rate_card_id || '').trim(),
        shippingMethod: String(r.shipping_method || '').trim(),
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
        totalQty: parseFloat(r.total_qty) || 0,
        totalCartons: parseFloat(r.total_cartons) || 0,
        totalCbm: (r.total_cbm === '' || r.total_cbm == null) ? '' : (parseFloat(r.total_cbm) || 0),
        totalGrossWeight: (r.total_gross_weight === '' || r.total_gross_weight == null) ? '' : (parseFloat(r.total_gross_weight) || 0),
        totalNetWeight: (r.total_net_weight === '' || r.total_net_weight == null) ? '' : (parseFloat(r.total_net_weight) || 0),
        freightCostActual: (r.freight_cost_actual === '' || r.freight_cost_actual == null) ? '' : (parseFloat(r.freight_cost_actual) || 0),
        dutyActual: (r.duty_actual === '' || r.duty_actual == null) ? '' : (parseFloat(r.duty_actual) || 0),
        currency: String(r.currency || '').trim(),
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
        qty: parseFloat(r.qty) || 0,
        factoryStockAllocationQty: (r.factory_stock_allocation_qty === '' || r.factory_stock_allocation_qty == null) ? '' : (parseFloat(r.factory_stock_allocation_qty) || 0),
        cartonQty: parseFloat(r.carton_qty) || 0,
        cartonNoStart: String(r.carton_no_start || '').trim(),
        cartonNoEnd: String(r.carton_no_end || '').trim(),
        unitsPerCarton: parseFloat(r.units_per_carton) || 0,
        cartonCbm: (r.carton_cbm === '' || r.carton_cbm == null) ? '' : (parseFloat(r.carton_cbm) || 0),
        cbm: (r.cbm === '' || r.cbm == null) ? '' : (parseFloat(r.cbm) || 0),
        grossWeight: (r.gross_weight === '' || r.gross_weight == null) ? '' : (parseFloat(r.gross_weight) || 0),
        netWeight: (r.net_weight === '' || r.net_weight == null) ? '' : (parseFloat(r.net_weight) || 0),
        purchaseOrderLineId: String(r.purchase_order_line_id || '').trim(),
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

function normalizeOperationDb(rawDb) {
    var db = rawDb || {};
    return {
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
        shipmentLines: (db.shipment_lines || []).map(normalizeShipmentLineRecord).filter(function(r) { return r.shipmentLineId || r.shipmentId; })
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

window.KM.DB.getFactoryStockMovements = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.factoryStockMovements || [];
};

window.KM.DB.getWarehouses = function() {
    if (!window._opDbCache) return [];
    return window._opDbCache.warehouses || [];
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

// Status transitions: { shipping_plan_id, transition: submit|approve|reject|cancel, rejected_reason?, actor? }
window.KM.DB.updateShippingPlanStatus = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updateShippingPlanStatus skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'updateShippingPlanStatus' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Update status failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Edit approved_qty (Draft only): { lines: [ { shipping_plan_line_id, approved_qty } ] }
window.KM.DB.updateShippingPlanLineQty = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, updateShippingPlanLineQty skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'updateShippingPlanLineQty' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Update qty failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Append a note to shipping_plans.note (append-only history): { shipping_plan_id, note, actor? }.
// Never overwrites existing notes and never touches rejected_reason.
window.KM.DB.appendShippingPlanNote = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, appendShippingPlanNote skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'appendShippingPlanNote' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Append note failed');
    await loadOperationDb({ force: true });
    return json.data;
};

// Decision Layer Completion (Done): mark an Approved + transferred plan completed. Writes only
// completed_at / completed_by. { shipping_plan_id, actor? }. Does NOT touch shipments.
window.KM.DB.completeShippingPlan = async function(payload) {
    if (!isOperationDbApiConfigured()) {
        console.warn('[KM.DB] API not configured, completeShippingPlan skipped');
        return { success: false, error: 'API not configured' };
    }
    var resp = await fetch(OP_DB_API_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ action: 'completeShippingPlan' }, payload))
    });
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Complete shipping plan failed');
    await loadOperationDb({ force: true });
    return json.data;
};

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
