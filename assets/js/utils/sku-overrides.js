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

// F1-S1: SKU lifecycle override authority REMOVED. Lifecycle now comes ONLY from sku_details.lifecycle.
// getSkuLifecycleOverrides / getSkuLifecycleOverride / setSkuLifecycleOverride were deleted. The stale
// browser key (km_sku_lifecycle_overrides_v1) is purged once on load (see _skuPurgeLegacyLifecycleOverride).
// Image overrides (km_sku_image_overrides_v1) and imported-SKU data overrides (km_sku_data_overrides_v1)
// are UNCHANGED — this round removes lifecycle authority only.

function getSkuImageOverrides() {
    try { return JSON.parse(localStorage.getItem(SKU_IMAGE_KEY)) || {}; }
    catch(e) { return {}; }
}

function getSkuImageOverride(sku) {
    const overrides = getSkuImageOverrides();
    return overrides[sku] ? overrides[sku].image : null;
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

// F1-S1: lifecycle authority = sku_details.lifecycle ONLY. No browser override is consulted.
function getNormalizedSkuStatus(item) {
    return mapStatusToLifecycle((item && (item.status || item.lifecycle)) || '');
}

function getNormalizedSkuImage(item) {
    const override = getSkuImageOverride(item.sku);
    var raw = override || item.image || item.imageUrl || item.image_url || '';
    return resolveSkuImageUrl(raw);
}

function resolveSkuImageUrl(imageUrl) {
    if (!imageUrl || !String(imageUrl).trim()) return '';
    var url = String(imageUrl).trim();
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return url;
}

// Get all SKU data with overrides applied, grouped by lifecycle
function getAllSkuDataWithOverrides() {
    // Try KM.DB first (Google Sheet or mock via API adapter)
    var baseItems = [];
    if (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) {
        var dbItems = window.KM.DB.getSkuDetails();
        if (dbItems && dbItems.length > 0) {
            baseItems = dbItems.map(function(i) { return Object.assign({}, i, { _originalGroup: i.lifecycle || 'Running in the Market' }); });
        }
    }
    // Fallback to raw mock arrays if DB not loaded yet
    if (baseItems.length === 0) {
        baseItems = [
            ...(window.upcomingSkuData || []).map(function(i) { return Object.assign({}, i, { _originalGroup: 'Upcoming SKU' }); }),
            ...(window.runningSkuData || []).map(function(i) { return Object.assign({}, i, { _originalGroup: 'Running in the Market' }); }),
            ...(window.phasingOutSkuData || []).map(function(i) { return Object.assign({}, i, { _originalGroup: 'Phasing Out' }); })
        ];
    }

    var allRaw = baseItems;

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
        // F1-S1: lifecycle is NEVER overridden from the browser — it comes only from sku_details.lifecycle.
        // Apply ONLY the image override from localStorage (lifecycle override authority removed).
        const imgOverride = getSkuImageOverride(item.sku);
        const merged = Object.assign({}, item);
        if (imgOverride) merged.image = imgOverride;
        const lifecycle = getNormalizedSkuStatus(merged);
        if (groups[lifecycle]) {
            groups[lifecycle].push(merged);
        } else {
            groups['Running in the Market'].push(merged);
        }
    });

    return groups;
}

// CSV Export - Google Sheet sku_details schema
function exportSkuStatusTemplate() {
    // Use KM.DB as primary source
    var items = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
    if (items.length === 0) {
        // Fallback to getAllSkuDataWithOverrides
        var groups = getAllSkuDataWithOverrides();
        Object.values(groups).forEach(function(arr) { items = items.concat(arr); });
    }

    var headers = ['sku','product_name','category','series','lifecycle','image_url','gs1_code','gs1_type','amz_asin','item_dimensions','item_weight','package_dimensions','package_weight','carton_dimensions','carton_weight','units_per_carton','hscode','declared_value','minimum_price','msrp','selling_price','pm','created_at','updated_at'];
    var rows = [headers];

    items.forEach(function(item) {
        rows.push([
            item.sku || '',
            '"' + (item.productName || '').replace(/"/g, '""') + '"',
            item.category || item.productLine || '',
            item.series || '',
            item.lifecycle || '',
            item.image || '',
            item.gs1Code || '',
            item.gs1Type || '',
            item.amzAsin || '',
            item.itemDimensions || '',
            item.itemWeight || '',
            item.packageDimensions || '',
            item.packageWeight || '',
            item.cartonDimensions || '',
            item.cartonWeight || '',
            item.unitsPerCarton || '',
            item.hsCode || item.hscode || '',
            item.declaredValue || '',
            item.minimumPrice || '',
            item.msrp || '',
            item.sellingPrice || '',
            item.pm || '',
            item.createdAt || '',
            item.updatedAt || ''
        ]);
    });

    var csv = rows.map(function(r) { return r.join(','); }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = 'sku_details_export_' + today + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// CSV Import - Validate and Preview (no cloud write without bulk action)
const SKU_DATA_OVERRIDE_KEY = 'km_sku_data_overrides_v1';
var IMPORT_SCHEMA_HEADERS = ['sku','product_name','category','series','lifecycle','image_url','gs1_code','gs1_type','amz_asin','item_dimensions','item_weight','package_dimensions','package_weight','carton_dimensions','carton_weight','units_per_carton','hscode','declared_value','minimum_price','msrp','selling_price','pm','created_at','updated_at'];
var IMPORT_REQUIRED_FIELDS = ['sku', 'product_name', 'category', 'series', 'lifecycle'];
var IMPORT_NUMBER_FIELDS = ['item_weight', 'package_weight', 'carton_weight', 'units_per_carton', 'declared_value', 'minimum_price', 'msrp', 'selling_price'];

function getSkuDataOverrides() {
    try { return JSON.parse(localStorage.getItem(SKU_DATA_OVERRIDE_KEY)) || {}; }
    catch(e) { return {}; }
}

function saveSkuDataOverrides(overrides) {
    localStorage.setItem(SKU_DATA_OVERRIDE_KEY, JSON.stringify(overrides));
}

function importSkuStatusTemplate(file) {
    return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var text = e.target.result;
            var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
            if (lines.length < 2) { resolve({ total: 0, valid: 0, errors: [], newCount: 0, updateCount: 0, preview: [] }); return; }

            var header = parseCSVLine(lines[0]).map(function(h) { return h.trim().toLowerCase(); });
            var skuIdx = header.indexOf('sku');
            if (skuIdx === -1) { resolve({ total: lines.length - 1, valid: 0, errors: [{ row: 1, sku: '', field: 'header', message: 'Missing sku column' }], newCount: 0, updateCount: 0, preview: [] }); return; }

            // Get existing SKUs from KM.DB
            var existingSkus = new Set();
            var dbItems = (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : [];
            dbItems.forEach(function(i) { existingSkus.add(i.sku); });

            var errors = [];
            var preview = [];
            var importedSkus = {};
            var validCount = 0;
            var newCount = 0;
            var updateCount = 0;

            for (var i = 1; i < lines.length; i++) {
                var cols = parseCSVLine(lines[i]);
                var row = {};
                header.forEach(function(h, idx) { row[h] = (cols[idx] || '').trim(); });
                var sku = row.sku || '';
                var rowNum = i + 1;
                var rowErrors = [];

                // Required fields
                IMPORT_REQUIRED_FIELDS.forEach(function(f) {
                    if (!row[f]) rowErrors.push({ row: rowNum, sku: sku, field: f, message: f + ' is required' });
                });

                // Lifecycle validation
                if (row.lifecycle && VALID_LIFECYCLES.indexOf(row.lifecycle) === -1 && row.lifecycle !== 'Other') {
                    rowErrors.push({ row: rowNum, sku: sku, field: 'lifecycle', message: 'Invalid lifecycle: ' + row.lifecycle });
                }

                // Number fields validation
                IMPORT_NUMBER_FIELDS.forEach(function(f) {
                    if (row[f] && isNaN(parseFloat(row[f]))) {
                        rowErrors.push({ row: rowNum, sku: sku, field: f, message: f + ' must be a number' });
                    }
                });

                // Duplicate in file
                if (sku && importedSkus[sku]) {
                    rowErrors.push({ row: rowNum, sku: sku, field: 'sku', message: 'Duplicate SKU in import file (first at row ' + importedSkus[sku] + ')' });
                }
                if (sku) importedSkus[sku] = rowNum;

                var action = 'error';
                if (rowErrors.length === 0) {
                    validCount++;
                    if (existingSkus.has(sku)) { action = 'update'; updateCount++; }
                    else { action = 'new'; newCount++; }
                } else {
                    errors = errors.concat(rowErrors);
                }

                preview.push({ sku: sku, product_name: row.product_name || '', category: row.category || '', series: row.series || '', lifecycle: row.lifecycle || '', action: action });
            }

            resolve({ total: lines.length - 1, valid: validCount, errors: errors, newCount: newCount, updateCount: updateCount, preview: preview });
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

// Reset all overrides. (Lifecycle key is also purged here as one-time cleanup — it is no longer an authority.)
function resetSkuHandbookOverrides() {
    localStorage.removeItem(SKU_LIFECYCLE_KEY);
    localStorage.removeItem(SKU_IMAGE_KEY);
    localStorage.removeItem(SKU_DATA_OVERRIDE_KEY);
    if (window.renderSkuDetailsTable) renderSkuDetailsTable();
    if (window.renderSkuHandbook) renderSkuHandbook();
    console.log('[SKU Overrides] All overrides cleared.');
}

// F1-S1: one-time purge of the now-orphaned lifecycle override key so any leftover stale browser value
// (the CO5600-RB "Upcoming SKU" symptom) is removed. Idempotent; touches ONLY the lifecycle key. Image +
// imported-SKU data overrides are left intact.
function _skuPurgeLegacyLifecycleOverride() {
    try { if (typeof localStorage !== 'undefined' && localStorage.getItem(SKU_LIFECYCLE_KEY) !== null) { localStorage.removeItem(SKU_LIFECYCLE_KEY); console.log('[SKU Overrides] Purged legacy lifecycle override (authority is now sku_details.lifecycle).'); } } catch (e) {}
}
_skuPurgeLegacyLifecycleOverride();

// Expose
window.getSkuImageOverride = getSkuImageOverride;
window.getNormalizedSkuStatus = getNormalizedSkuStatus;
window.getNormalizedSkuImage = getNormalizedSkuImage;
window.resolveSkuImageUrl = resolveSkuImageUrl;
window.getAllSkuDataWithOverrides = getAllSkuDataWithOverrides;
window.setSkuImageOverride = setSkuImageOverride;
window.exportSkuStatusTemplate = exportSkuStatusTemplate;
window.importSkuStatusTemplate = importSkuStatusTemplate;
window.resetSkuHandbookOverrides = resetSkuHandbookOverrides;
window.getSkuDataOverrides = getSkuDataOverrides;
window.VALID_LIFECYCLES = VALID_LIFECYCLES;
