// ========================================
// SKU Override Helpers (Shared)
// ========================================

const SKU_LIFECYCLE_KEY = 'km_sku_lifecycle_overrides_v1';
const SKU_IMAGE_KEY = 'km_sku_image_overrides_v1';

const VALID_LIFECYCLES = [
    'Upcoming SKU',
    'Running in the Market',
    'Phasing Out',
    'Closure'
];

function getSkuLifecycleOverrides() {
    try { return JSON.parse(localStorage.getItem(SKU_LIFECYCLE_KEY)) || {}; }
    catch(e) { return {}; }
}

function getSkuImageOverrides() {
    try { return JSON.parse(localStorage.getItem(SKU_IMAGE_KEY)) || {}; }
    catch(e) { return {}; }
}

function getSkuLifecycleOverride(sku) {
    const overrides = getSkuLifecycleOverrides();
    return overrides[sku] ? overrides[sku].lifecycle : null;
}

function getSkuImageOverride(sku) {
    const overrides = getSkuImageOverrides();
    return overrides[sku] ? overrides[sku].image : null;
}

function setSkuLifecycleOverride(sku, lifecycle) {
    if (!VALID_LIFECYCLES.includes(lifecycle)) return false;
    const overrides = getSkuLifecycleOverrides();
    overrides[sku] = { lifecycle: lifecycle, updatedAt: new Date().toISOString() };
    localStorage.setItem(SKU_LIFECYCLE_KEY, JSON.stringify(overrides));
    return true;
}

function setSkuImageOverride(sku, imageUrl) {
    const overrides = getSkuImageOverrides();
    overrides[sku] = { image: imageUrl, updatedAt: new Date().toISOString() };
    localStorage.setItem(SKU_IMAGE_KEY, JSON.stringify(overrides));
    return true;
}

// Map original status to normalized lifecycle
function mapStatusToLifecycle(status) {
    if (!status) return 'Running in the Market';
    var s = status.toLowerCase();
    if (s === 'upcoming' || s === 'upcoming sku') return 'Upcoming SKU';
    if (s === 'active' || s === 'running' || s === 'running in the market') return 'Running in the Market';
    if (s === 'phasing out' || s === 'phasing') return 'Phasing Out';
    if (s === 'closure' || s === 'closed') return 'Closure';
    return 'Running in the Market';
}

function getNormalizedSkuStatus(item) {
    const override = getSkuLifecycleOverride(item.sku);
    if (override) return override;
    return mapStatusToLifecycle(item.status || item.lifecycle);
}

function getNormalizedSkuImage(item) {
    const override = getSkuImageOverride(item.sku);
    if (override) return override;
    return item.image || item.imageUrl || '';
}

// Get all SKU data with overrides applied, grouped by lifecycle
function getAllSkuDataWithOverrides() {
    const allRaw = [
        ...(window.upcomingSkuData || []).map(i => ({ ...i, _originalGroup: 'Upcoming SKU' })),
        ...(window.runningSkuData || []).map(i => ({ ...i, _originalGroup: 'Running in the Market' })),
        ...(window.phasingOutSkuData || []).map(i => ({ ...i, _originalGroup: 'Phasing Out' }))
    ];

    const dataOverrides = getSkuDataOverrides();
    const existingSkus = new Set(allRaw.map(i => i.sku));

    // Restore imported SKUs from localStorage that don't exist in base data
    Object.entries(dataOverrides).forEach(([sku, override]) => {
        if (!existingSkus.has(sku) && override.productName) {
            allRaw.push({ ...override, sku, _originalGroup: 'Running in the Market' });
            existingSkus.add(sku);
        }
    });

    const groups = {
        'Upcoming SKU': [],
        'Running in the Market': [],
        'Phasing Out': [],
        'Closure': []
    };

    allRaw.forEach(item => {
        // Apply data overrides
        const override = dataOverrides[item.sku];
        const merged = override ? { ...item, ...override, sku: item.sku } : item;
        const lifecycle = getNormalizedSkuStatus(merged);
        if (groups[lifecycle]) {
            groups[lifecycle].push(merged);
        } else {
            groups['Running in the Market'].push(merged);
        }
    });

    return groups;
}

// CSV Export - Full SKU template
function exportSkuStatusTemplate() {
    const groups = getAllSkuDataWithOverrides();
    const headers = ['sku','product_name','category','series','lifecycle','image_url','gs1_code','gs1_type','amz_asin','item_dimensions','item_weight','package_dimensions','package_weight','carton_dimensions','carton_weight','units_per_carton','hscode','declared_value','minimum_price','msrp','selling_price','pm'];
    const rows = [headers];

    Object.entries(groups).forEach(([lifecycle, items]) => {
        items.forEach(item => {
            const img = getNormalizedSkuImage(item);
            rows.push([
                item.sku,
                '"' + (item.productName || '').replace(/"/g, '""') + '"',
                item.category || '',
                item.series || '',
                lifecycle,
                img,
                item.gs1Code || '',
                item.gs1Type || '',
                item.amzAsin || '',
                item.itemDimensions || '',
                item.itemWeight || '',
                item.package || item.packageDimensions || '',
                item.packageWeight || '',
                item.cartonDimensions || '',
                item.cartonWeight || '',
                item.unitsPerCarton || '',
                item.hscode || '',
                item.declaredValue || '',
                item.minimumPrice || '',
                item.msrp || '',
                item.sellingPrice || '',
                item.pm || ''
            ]);
        });
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sku_status_template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// CSV Import - supports both update existing and add new SKUs
const SKU_DATA_OVERRIDE_KEY = 'km_sku_data_overrides_v1';

function getSkuDataOverrides() {
    try { return JSON.parse(localStorage.getItem(SKU_DATA_OVERRIDE_KEY)) || {}; }
    catch(e) { return {}; }
}

function saveSkuDataOverrides(overrides) {
    localStorage.setItem(SKU_DATA_OVERRIDE_KEY, JSON.stringify(overrides));
}

function importSkuStatusTemplate(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) { resolve({ updated: 0, added: 0, skipped: 0 }); return; }

            const header = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
            const skuIdx = header.indexOf('sku');
            if (skuIdx === -1) { resolve({ updated: 0, added: 0, skipped: lines.length - 1 }); return; }

            // Column mapping: csv header -> JS field name
            const colMap = {
                'product_name': 'productName',
                'category': 'category',
                'series': 'series',
                'lifecycle': 'status',
                'image_url': 'image',
                'gs1_code': 'gs1Code',
                'gs1_type': 'gs1Type',
                'amz_asin': 'amzAsin',
                'item_dimensions': 'itemDimensions',
                'item_weight': 'itemWeight',
                'package_dimensions': 'packageDimensions',
                'package': 'packageDimensions',
                'package_weight': 'packageWeight',
                'carton_dimensions': 'cartonDimensions',
                'carton_weight': 'cartonWeight',
                'units_per_carton': 'unitsPerCarton',
                'hscode': 'hscode',
                'declared_value': 'declaredValue',
                'minimum_price': 'minimumPrice',
                'msrp': 'msrp',
                'selling_price': 'sellingPrice',
                'pm': 'pm',
                // Legacy support
                'new_lifecycle': 'status',
                'current_lifecycle': '_ignore'
            };

            const allSkus = [...(window.upcomingSkuData || []), ...(window.runningSkuData || []), ...(window.phasingOutSkuData || [])];
            const skuSet = new Set(allSkus.map(i => i.sku));
            const overrides = getSkuDataOverrides();

            let updated = 0, added = 0, skipped = 0;

            for (let i = 1; i < lines.length; i++) {
                const cols = parseCSVLine(lines[i]);
                const sku = (cols[skuIdx] || '').trim();
                if (!sku) { skipped++; continue; }

                const record = { sku: sku };
                let hasData = false;

                header.forEach((h, idx) => {
                    if (idx === skuIdx) return;
                    const field = colMap[h];
                    if (!field || field === '_ignore') return;
                    const val = (cols[idx] || '').trim();
                    if (val) {
                        record[field] = field === 'unitsPerCarton' ? parseInt(val) || 0 : val;
                        hasData = true;
                    }
                });

                if (!hasData) { skipped++; continue; }

                // Handle lifecycle
                if (record.status) {
                    const mapped = mapStatusToLifecycle(record.status);
                    setSkuLifecycleOverride(sku, mapped);
                    record.status = mapped;
                }

                // Handle image
                if (record.image) {
                    setSkuImageOverride(sku, record.image);
                }

                // Store full data override
                overrides[sku] = { ...overrides[sku], ...record, updatedAt: new Date().toISOString() };

                if (skuSet.has(sku)) {
                    updated++;
                } else {
                    // New SKU - add to runningSkuData
                    const newItem = {
                        sku: sku,
                        image: record.image || '',
                        status: record.status || 'Running in the Market',
                        productName: record.productName || sku,
                        series: record.series || '',
                        category: record.category || '',
                        gs1Code: record.gs1Code || '',
                        gs1Type: record.gs1Type || '',
                        amzAsin: record.amzAsin || '',
                        itemDimensions: record.itemDimensions || '',
                        itemWeight: record.itemWeight || '',
                        packageDimensions: record.packageDimensions || '',
                        packageWeight: record.packageWeight || '',
                        cartonDimensions: record.cartonDimensions || '',
                        cartonWeight: record.cartonWeight || '',
                        unitsPerCarton: record.unitsPerCarton || 0,
                        hscode: record.hscode || '',
                        declaredValue: record.declaredValue || '',
                        minimumPrice: record.minimumPrice || '',
                        msrp: record.msrp || '',
                        sellingPrice: record.sellingPrice || '',
                        pm: record.pm || ''
                    };
                    window.runningSkuData.push(newItem);
                    skuSet.add(sku);
                    added++;
                }
            }

            saveSkuDataOverrides(overrides);
            resolve({ updated, added, skipped });
        };
        reader.readAsText(file);
    });
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
            result.push(current); current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

// Reset all overrides
function resetSkuHandbookOverrides() {
    localStorage.removeItem(SKU_LIFECYCLE_KEY);
    localStorage.removeItem(SKU_IMAGE_KEY);
    localStorage.removeItem(SKU_DATA_OVERRIDE_KEY);
    if (window.renderSkuDetailsTable) renderSkuDetailsTable();
    if (window.renderSkuHandbook) renderSkuHandbook();
    console.log('[SKU Overrides] All overrides cleared.');
}

// Expose
window.getSkuLifecycleOverride = getSkuLifecycleOverride;
window.getSkuImageOverride = getSkuImageOverride;
window.getNormalizedSkuStatus = getNormalizedSkuStatus;
window.getNormalizedSkuImage = getNormalizedSkuImage;
window.getAllSkuDataWithOverrides = getAllSkuDataWithOverrides;
window.setSkuLifecycleOverride = setSkuLifecycleOverride;
window.setSkuImageOverride = setSkuImageOverride;
window.exportSkuStatusTemplate = exportSkuStatusTemplate;
window.importSkuStatusTemplate = importSkuStatusTemplate;
window.resetSkuHandbookOverrides = resetSkuHandbookOverrides;
window.getSkuDataOverrides = getSkuDataOverrides;
window.VALID_LIFECYCLES = VALID_LIFECYCLES;
