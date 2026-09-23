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
//
// S2-R4A — AND NOW THE OTHER TWO. F1-S1 left them alone and said so; that sentence was a statement about
// F1-S1's scope, not a contract, and this is the round that closes it.
//
// WHAT WAS ACTUALLY TRUE WHEN WE LOOKED. Both keys had already lost their writers:
//
//   setSkuImageOverride   0 callers — and 'git log -S' finds none in the reachable history of any page,
//                         so no shipped UI has ever written km_sku_image_overrides_v1.
//   saveSkuDataOverrides  0 callers anywhere, source or test.
//
// So neither key could still be FILLED by the product. What they could still do is OUTRANK the server,
// and that is what a stale key is dangerous for:
//
//   1. getNormalizedSkuImage put the browser value FIRST — 'override || item.image || …' — so one machine
//      showed a different photograph for a SKU than every other machine, off a value nothing had written
//      since before the canonical read existed.
//   2. getAllSkuDataWithOverrides INJECTED WHOLE SKU ROWS the server did not return. A row that exists in
//      one browser profile and nowhere else is not a SKU; it is a rumour with a product name.
//
// Both are gone. sku_details is the owner: 'image_url' for the picture (canonical read →
// KM.DB.upsertSkuDetail for the write), and the row set itself for which SKUs exist.
//
// THE KEYS ARE IGNORED, NOT DELETED, and that is deliberate. A lifecycle override duplicated a server
// field, so purging it on load destroyed nothing. An imported-SKU override may be the ONLY copy of
// something a person typed. Retiring an authority is not a licence to destroy the evidence, so the keys
// stay readable — debugLegacySkuOverrides() still reports them — and resetSkuHandbookOverrides() still
// clears them when an operator ASKS. What no longer happens is either key reaching a rendered value.
//
// AND NOTHING IS MIGRATED. A stale browser row is not a write the operator authorised, and promoting one
// into sku_details automatically would invent a canonical fact out of residue.

function getSkuImageOverrides() {
    try { return JSON.parse(localStorage.getItem(SKU_IMAGE_KEY)) || {}; }
    catch(e) { return {}; }
}

function getSkuImageOverride(sku) {
    const overrides = getSkuImageOverrides();
    return overrides[sku] ? overrides[sku].image : null;
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

// S2-R4A — THE ROW OWNS THE PICTURE. The browser override used to be consulted FIRST, which meant a value
// no shipped code has ever written could outrank sku_details.image_url on one machine and nowhere else.
// The three spellings that remain are all the same canonical field arriving under different read paths
// (scoped workspace → `image`, broad cache / raw row → `imageUrl` / `image_url`); none of them is browser
// state. An absent value is still absent — resolveSkuImageUrl decides what that renders as.
function getNormalizedSkuImage(item) {
    var raw = (item && (item.image || item.imageUrl || item.image_url)) || '';
    return resolveSkuImageUrl(raw);
}

// F1-7N-FB-4E-R3 §F — RESOLVE THE STORED VALUE INTO SOMETHING A BROWSER WILL ACTUALLY FETCH.
//
// The stored field is not the problem. R3 §A traced it by execution: the sheet's `image_url` survives the scoped
// read as `image`, survives buildSkuKnowledgeItems and survives getNormalizedSkuImage. Nothing in the pipeline
// drops or renames it. So a page full of placeholders is not a lost field — it is a URL the browser refused.
//
// P1-B8C-R3 — THE RULE MOVED OUT OF THIS FILE, AND NOTHING ELSE CHANGED ABOUT WHERE IT IS CALLED FROM.
//
// This function used to BE the policy: upgrade http:// to https:// on an https page, and pass everything else
// through. Two things were wrong with that, and only the second one is new.
//
//   1. PASSING A VALUE THROUGH IS NOT THE SAME AS ACCEPTING IT. `javascript:alert(1)`, `C:\Users\...\x.jpg` and
//      a bare Drive id all went into `<img src>` verbatim, because nothing here ever looked at them. The mixed
//      content branch was the ONLY judgement this function made.
//   2. PRODUCT STRATEGY WAS MAKING THE OPPOSITE JUDGEMENT ABOUT THE SAME COLUMN. km-product-pricing-adapter.js
//      required an ABSOLUTE http(s) url before it would draw a photograph, and P1-B8C-R2 then measured what
//      production actually holds: sixty live rows, zero absolute urls, because `sku_details.image_url` is a
//      REPO-RELATIVE path. SKU Details drew the picture and the board drew a fallback marker, off one value.
//
// So the decision now lives in ONE place — assets/js/utils/km-image-reference-policy.js — and both pages ask it.
// The http:// -> https:// upgrade is preserved there exactly; what is added is that a reference which is not an
// image address is REFUSED rather than forwarded. This still changes no stored data and still invents no URL.
//
// FAIL CLOSED. If the policy file did not load, this returns '' rather than falling back to the old
// pass-everything behaviour. A safety rule with a lenient fallback is not a safety rule — it is the lenient
// behaviour with extra steps.
function _skuImagePolicy() {
    try {
        if (typeof KM_IMAGE_REFERENCE_POLICY !== 'undefined' && KM_IMAGE_REFERENCE_POLICY) return KM_IMAGE_REFERENCE_POLICY;
    } catch (e) { /* not defined in this scope */ }
    try {
        if (typeof window !== 'undefined' && window.KM_IMAGE_REFERENCE_POLICY) return window.KM_IMAGE_REFERENCE_POLICY;
    } catch (e) { /* no window */ }
    return null;
}

function resolveSkuImageUrl(imageUrl) {
    var P = _skuImagePolicy();
    if (!P) {
        try { console.error('[SKU Overrides] km-image-reference-policy.js is not loaded; refusing to resolve an image reference.'); } catch (e) {}
        return '';
    }
    return P.classify(imageUrl).url;
}

// Why a given SKU has no rendered image, as a value rather than as a look. `ABSENT` and `PRESENT` are decidable
// here; whether a PRESENT url actually loads is only knowable in the browser, which is what the renderer reports.
//
// P1-B8C-R3 adds the third answer this function could not previously give: REFUSED, with the reason. "There is
// no url on the row" and "the row carries something that is not an image address" are different facts with
// different fixes, and reporting both as ABSENT sent an operator to look for a missing value that was there.
function classifySkuImageSource(item) {
    // S2-R4A — reads exactly what getNormalizedSkuImage reads. A classifier that consulted the retired
    // browser override would answer PRESENT about a picture the renderer does not draw, which is worse
    // than no diagnosis: it sends the operator to look for a rendering bug that is not there.
    var raw = (item && (item.image || item.imageUrl || item.image_url)) || '';
    var P = _skuImagePolicy();
    if (!P) return { state: 'REFUSED', reason: 'IMAGE_POLICY_NOT_LOADED', url: '', note: null };
    var v = P.classify(raw);
    if (v.kind === 'ABSENT') return { state: 'ABSENT', reason: 'NO_IMAGE_URL_ON_RECORD', url: '', note: null };
    if (!v.accepted) return { state: 'REFUSED', reason: v.reason, url: '', note: null };
    return { state: 'PRESENT', reason: null, url: v.url, note: v.note || null, kind: v.kind };
}

// Get all SKU data with overrides applied, grouped by lifecycle.
// F1-7H: optional `sourceItems` — the SKU Details page passes its scoped-workspace read-model in canonical mode so the
// primary render no longer depends on the broad `_opDbCache`. When omitted (Legacy / sku-handbook), it reads the getter.
function getAllSkuDataWithOverrides(sourceItems) {
    // Scoped read-model (workspace) when provided; else KM.DB getter (Google Sheet or mock via API adapter).
    var baseItems = [];
    var dbItems = Array.isArray(sourceItems)
        ? sourceItems
        : ((window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? window.KM.DB.getSkuDetails() : null);
    if (dbItems && dbItems.length > 0) {
        baseItems = dbItems.map(function(i) { return Object.assign({}, i, { _originalGroup: i.lifecycle || 'Running in the Market' }); });
    }
    // Fallback to raw mock arrays if DB not loaded yet
    if (baseItems.length === 0) {
        baseItems = [
            ...(window.upcomingSkuData || []).map(function(i) { return Object.assign({}, i, { _originalGroup: 'Upcoming SKU' }); }),
            ...(window.runningSkuData || []).map(function(i) { return Object.assign({}, i, { _originalGroup: 'Running in the Market' }); }),
            ...(window.phasingOutSkuData || []).map(function(i) { return Object.assign({}, i, { _originalGroup: 'Phasing Out' }); })
        ];
    }

    // S2-R4A — WHICH SKUs EXIST IS THE SERVER'S ANSWER, NOT THIS BROWSER'S.
    //
    // A block here used to read km_sku_data_overrides_v1 and PUSH any key the base set did not contain,
    // as a full row, into 'Running in the Market'. It called itself "restore", which is the word you use
    // when the store you are reading from is a copy of something. It was not a copy: the writer that
    // filled it has no callers, so anything still in that key predates the canonical read and exists on
    // exactly one machine. The row then flowed on into the handbook, the table and the export as though
    // the server had returned it.
    //
    // Nothing is injected now. The key is not deleted — see the ruling at the top of this file — it is
    // simply not an authority, and it is not migrated anywhere either.
    var allRaw = baseItems;

    const groups = {
        'Upcoming SKU': [],
        'Running in the Market': [],
        'Phasing Out': [],
        'Closure': []
    };

    allRaw.forEach(item => {
        // F1-S1: lifecycle is NEVER overridden from the browser — it comes only from sku_details.lifecycle.
        // S2-R4A: neither is the image. The copy is kept because the grouping below reads it and callers
        // hand us their own read model; what is no longer done to it is a browser merge.
        const merged = Object.assign({}, item);
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
//
// F1-S2-R2-R2 — THE EXPORT HAS THE SAME UNIVERSE AS THE IMPORT, AND THE SAME REFUSAL.
//
// The source used to be a three-step fallback chain, and in a canonical session every step of it
// was wrong. `KM.DB.getSkuDetails()` is the broad Operation-DB cache, which nothing primes once the
// SKU Details primary read went canonical, so it returned []. That emptiness then triggered
// `getAllSkuDataWithOverrides()` with no argument, which read the SAME empty broad cache and fell
// through to the hardcoded demo arrays in utils/data.js — 26 invented SKUs with invented UPCs,
// prices and a PM named "Alice" — plus whatever sat in localStorage. The user then received a file
// called sku_details_export_<date>.csv containing none of their data and no warning that it was
// fabricated, which is a worse failure than the import miscount that led us here: a silent wrong
// answer that leaves the building.
//
// So the page injects the universe it is itself displaying, there is NO FALLBACK of any kind, and an
// absent or invalid universe produces NO FILE AT ALL. A universe that is positively known to be
// empty is a real answer and still exports the header row, because "you have no SKUs" and "we do not
// know what you have" are different facts and only the first one may be written to a file.
function exportSkuStatusTemplate(skuUniverse) {
    if (!Array.isArray(skuUniverse)) return;   // fail closed BEFORE any Blob, object URL or click
    var items = skuUniverse;                   // read only; never mutated, never re-fetched

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

// F1-S2-R2-R1 — THE SKU UNIVERSE IS INJECTED BY THE PAGE, AND ITS ABSENCE IS NOT AN EMPTY UNIVERSE.
//
// This read used to be `KM.DB.getSkuDetails()`, the broad Operation-DB cache. Since the SKU Details
// primary read went canonical and default-on, nothing primes that cache in an ordinary session —
// every page that could load it sits behind its own kill switch — so the getter returned `[]`, the
// "existing SKUs" set was empty, and EVERY ROW OF AN IMPORTED TEMPLATE WAS COUNTED NEW, including
// SKUs that already exist. Wrong in the one direction nobody checks, and non-deterministic with it:
// visit a kill-switch page first, the broad cache is primed, and the same file counts correctly.
//
// So the caller passes the universe it is itself displaying, and there is NO FALLBACK. An absent or
// invalid argument REFUSES BEFORE THE FILE IS READ, because an unknown universe and an empty one are
// different facts and only one of them may be answered with "everything here is new".
function importSkuStatusTemplate(file, skuUniverse) {
    return new Promise(function(resolve) {
        if (!Array.isArray(skuUniverse)) {
            resolve({ total: 0, valid: 0, newCount: 0, updateCount: 0, preview: [], universeUnavailable: true,
                errors: [{ row: 0, sku: '', field: 'universe',
                    message: 'The SKU list has not loaded, so new and existing SKUs cannot be told apart. Nothing was validated.' }] });
            return;
        }
        var reader = new FileReader();
        reader.onload = function(e) {
            var text = e.target.result;
            var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
            if (lines.length < 2) { resolve({ total: 0, valid: 0, errors: [], newCount: 0, updateCount: 0, preview: [] }); return; }

            var header = parseCSVLine(lines[0]).map(function(h) { return h.trim().toLowerCase(); });
            var skuIdx = header.indexOf('sku');
            if (skuIdx === -1) { resolve({ total: lines.length - 1, valid: 0, errors: [{ row: 1, sku: '', field: 'header', message: 'Missing sku column' }], newCount: 0, updateCount: 0, preview: [] }); return; }

            // The injected canonical universe: read only, never mutated, never re-fetched.
            var existingSkus = new Set();
            skuUniverse.forEach(function(i) { if (i && i.sku) existingSkus.add(i.sku); });

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
window.classifySkuImageSource = classifySkuImageSource;
window.getAllSkuDataWithOverrides = getAllSkuDataWithOverrides;
window.exportSkuStatusTemplate = exportSkuStatusTemplate;
window.importSkuStatusTemplate = importSkuStatusTemplate;
window.resetSkuHandbookOverrides = resetSkuHandbookOverrides;
window.getSkuDataOverrides = getSkuDataOverrides;
window.VALID_LIFECYCLES = VALID_LIFECYCLES;
