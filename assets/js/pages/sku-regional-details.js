// ========================================
// SKU Regional Details — Master-SKU-first workspace V2
// SKU Domain v2.0 Layer 2 (sku_regional_details). Left panel = ONE row per Master SKU. Right panel =
// country tabs → (Company·Marketplace selector when a country has >1 record) → 6 sections
// (Overview / Marketplace / Packaging & Localization / Compliance / Tax & Commercial / Audit).
//
// Writes ONLY sku_regional_details via KM.DB.upsertSkuRegionalDetail (composite key sku+company+country+
// marketplace; preserves omitted fields; syncs site_sku/marketplace_product_id INTO marketplace_skus —
// Regional = higher-priority source). Master name/series/category + operational status are READ-ONLY
// joins. Tax & Commercial is a READ-ONLY join to tax_referral_rates (SSOT) — never written here, never
// first-row: resolved by Series + country_of_origin → duty_country + effective date. NO pricing write.
// ========================================
(function () {
    'use strict';

    // Verified canonical Regional field set (schema: 18_sku_regional_handlers.gs / API normalizer).
    // Editable regional fields (snake_case payload) — the ONLY fields this page writes.
    var EDIT_FIELDS = [
        { key: 'site_sku', cc: 'siteSku', label: 'Site SKU' },
        { key: 'marketplace_product_id', cc: 'marketplaceProductId', label: 'Marketplace Product ID / ASIN' },
        { key: 'product_url', cc: 'productUrl', label: 'Product URL', wide: true },
        { key: 'packaging_regulation', cc: 'packagingRegulation', label: 'Packaging Regulation' },
        { key: 'regulation_url', cc: 'regulationUrl', label: 'Regulation URL' },
        { key: 'language', cc: 'language', label: 'Language' },
        { key: 'manual_version', cc: 'manualVersion', label: 'Manual Version' },
        { key: 'label_version', cc: 'labelVersion', label: 'Label Version' },
        { key: 'battery_regulation', cc: 'batteryRegulation', label: 'Battery Regulation' }
    ];

    // Standard country tab order. NOT an exhaustive whitelist — any country present in the data is also
    // shown (appended). Countries here with no record render as a muted "Not configured" tab.
    var STANDARD_COUNTRIES = ['US', 'CA', 'FR', 'DE', 'ES', 'UK', 'AU', 'JP'];

    var SECTIONS = ['overview', 'marketplace', 'packaging', 'compliance', 'tax', 'audit'];
    var SECTION_LABELS = { overview: 'Overview', marketplace: 'Marketplace', packaging: 'Packaging & Localization', compliance: 'Compliance', tax: 'Tax & Commercial', audit: 'Audit' };

    var srdState = {
        search: '', page: 1, pageSize: 50,
        selectedSku: null, activeCountry: null, activeRecordKey: null, activeSection: 'overview',
        filters: { category: [], series: [] }   // shared multi-select: [] = All (System Repair 2 §13)
    };
    var _srdReqSeq = 0;
    var _srdSaving = false;
    var _srdSearchTimer = null;
    var _srdMktIndex = null;    // composite → [marketplace_skus records]
    var _srdEditPricing = null; // PRICING-R2: the resolved pricing row the open editor may write, or null
    var _srdImportLines = null; // PRICING-R2: the lines a PREVIEWED import would write, or null
    var _srdMasterIndex = null; // sku → sku_details record

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function lc(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
    function up(s) { return String(s == null ? '' : s).trim().toUpperCase(); }
    function compositeKey(r) { return lc(r.sku) + '||' + lc(r.company) + '||' + lc(r.country) + '||' + lc(r.marketplace); }
    function rowKey(r) { return r.regionalDetailId || compositeKey(r); }
    function isAmazon(mkt) { return lc(mkt) === 'amazon'; }
    function el(id) { return document.getElementById(id); }

    function useDb() {
        // F1-7M-B2-HOTFIX (Shape-2 cold-start gate): cloud eligibility INDEPENDENT of whether the broad _opDbCache has
        // been primed (F1-7L zero-prime). This page's PRIMARY read is the skuDetails workspace (getWorkspace via
        // _srdEffectiveWorkspace, cache-independent); the legacy kill-switch path loads the broad cache on demand. The
        // former test required getDataSourceMode()==='google-sheet' (i.e. the broad cache ALREADY loaded), so a cold
        // canonical session wrongly showed the "Connect the Operation DB … demo mode" banner. Cloud-read eligibility is a
        // CONFIGURATION fact (API configured AND not explicit mock) — the SAME posture as the Shape-1 predicates (1ca7d13).
        // Explicit mock / unconfigured API → isScopedReadEligible() false → demo banner preserved (no accidental API call).
        return !!(window.KM && window.KM.DB && typeof window.KM.DB.isScopedReadEligible === 'function' &&
            window.KM.DB.isScopedReadEligible() && window.KM.DB.getSkuRegionalDetails);
    }

    // ------------------------------------------------------------------------------------------------------
    // F1-7J-A · scoped SKU Details workspace read cutover for the SECONDARY Regional page (mirrors F1-7H sku-details.js).
    // This PRIMARY page render sources its 5 tables — sku_regional_details + sku_details + marketplace_skus +
    // tax_referral_rates + tax_rate_components — from the EXISTING `skuDetails` workspace with include.regional (the
    // backend 59_ already returns the two 'regional' tables when include.regional is set). NO broad Operation DB for the
    // primary render. Kill switch: KM.api.setWorkspaceEnabled('skuDetails', false) → instant Legacy broad-cache. Canonical
    // default ON. Transports READ facts ONLY — the write path (upsertSkuRegionalDetail, incl. its marketplace_skus identity
    // sync) is UNCHANGED; NO new workspace, NO new API, NO Factory Stock init, NO company-from-factory inference. The
    // adapter (adaptSkuDetailsWorkspace) re-normalizes with the SAME normalizers + per-array filters as normalizeOperationDb,
    // so the arrays equal getSkuRegionalDetails/getSkuDetails/getMarketplaceSkus/getTaxReferralRates/getTaxRateComponents
    // exactly (BEFORE == AFTER).
    // ------------------------------------------------------------------------------------------------------
    function _srdEffectiveWorkspace() {
        return !!(window.KM && window.KM.api && typeof window.KM.api.workspaceApiActive === 'function' &&
            window.KM.api.workspaceApiActive('skuDetails'));
    }
    var _srdReadModel = null;   // workspace-sourced { skuRegionalDetails, skuDetails, marketplaceSkus, taxReferralRates, taxRateComponents } or null = Legacy
    var _srdReadSeq = 0;
    var _srdInFlight = false;   // F1-7M-B2-HOTFIX: in-flight guard — a rapid re-mount must not fire a duplicate workspace fetch
    // F1-7M-B2-HOTFIX: explicit same-session invalidation seam. Drops the canonical read-model so the NEXT mount re-reads
    // from the server. This-surface writes already refresh via _srdAfterWrite; this is exposed (window.srdInvalidate) for any
    // external surface that mutates sku_details / marketplace_skus / sku_regional_details to force a fresh read on re-entry.
    function _srdInvalidate_() { _srdReadModel = null; }

    // read-model-first accessors: Workspace mode reads the scoped DTO; Legacy reads the broad-cache getters unchanged.
    function _srdGetRegional() {
        if (_srdReadModel) return _srdReadModel.skuRegionalDetails || [];
        return (window.KM.DB.getSkuRegionalDetails && window.KM.DB.getSkuRegionalDetails()) || [];
    }
    function _srdGetMasters() {
        if (_srdReadModel) return _srdReadModel.skuDetails || [];
        return (window.KM.DB.getSkuDetails && window.KM.DB.getSkuDetails()) || [];
    }
    function _srdGetMktSkus() {
        if (_srdReadModel) return _srdReadModel.marketplaceSkus || [];
        return (window.KM.DB.getMarketplaceSkus && window.KM.DB.getMarketplaceSkus()) || [];
    }
    // Site prices. Workspace mode reads the scoped DTO; Legacy reads the broad-cache getter unchanged.
    function _srdGetPricing() {
        if (_srdReadModel) return _srdReadModel.pricingList || [];
        return (window.KM.DB.getPricingList && window.KM.DB.getPricingList()) || [];
    }
    function _srdPricingApi() { return (window.KM && window.KM.SkuRegionalPricing) || null; }
    // The pricing row for ONE regional record, resolved through its marketplace_skus row on all four parts
    // of the business identity. Never a first-row fallback: an ambiguous link reports itself.
    function _srdResolvePricing(r) {
        var P = _srdPricingApi();
        if (!P) return null;
        return P.resolveFor(r, _srdGetMktSkus(), _srdGetPricing());
    }

    function _srdGetTaxRates() {
        if (_srdReadModel) return _srdReadModel.taxReferralRates || [];
        return (window.KM.DB.getTaxReferralRates && window.KM.DB.getTaxReferralRates()) || [];
    }
    function _srdGetTaxComponents() {
        if (_srdReadModel) return _srdReadModel.taxRateComponents || [];
        return (window.KM.DB.getTaxRateComponents && window.KM.DB.getTaxRateComponents()) || [];
    }

    // Bounded loading/error region (reuses KM.loadState — no new loading infra). INITIAL_LOADING / READY / EMPTY / ERROR.
    var _srdRegionCtl = null;
    function _srdRegion_() {
        if (typeof document === 'undefined' || !(window.KM && window.KM.loadState)) return null;
        if (_srdRegionCtl) return _srdRegionCtl;
        _srdRegionCtl = window.KM.loadState.createRegion({
            render: function (state) {
                if (state === window.KM.loadState.STATES.INITIAL_LOADING) {
                    var w = el('srd-list');
                    if (w) w.innerHTML = '<div class="srd-skel"><span style="width:60%"></span><span style="width:80%"></span></div><div class="srd-skel"><span style="width:50%"></span><span style="width:70%"></span></div>';
                }
                // READY / EMPTY / ERROR / REFRESHING → render() / _srdRenderError_ own the DOM.
            }
        });
        return _srdRegionCtl;
    }
    // Fail-closed: NEVER fall back to the broad cache for the primary render (do NOT call render(), whose accessors would
    // otherwise read the broad getters when _srdReadModel is null).
    // F1-7N-FB-4C-R1 §F — DEPLOYMENT_MISMATCH IS NOT AN ERROR, AND NEITHER IS EMPTY.
    //
    // The live failure printed "Couldn’t load regional details: Missing or invalid action parameter … [BACKEND_ERROR]"
    // — a message with no action, no request id and no next step, offering a Retry for something a retry cannot
    // fix. The classifier now names the real state, so this banner shows WHICH action failed, its code, its request
    // id, and offers Retry ONLY where retrying can help. Nothing here is auto-retried.
    var SRD_NO_RETRY_CODES = { DEPLOYMENT_CONTRACT_MISMATCH: 1, CLIENT_ACTION_REQUIRED: 1 };
    function _srdRenderError_(err) {
        _srdReadModel = null;
        var code = (err && err.code) || 'SKU_REGIONAL_READ_FAILED';
        var message = (err && err.message) || 'SKU Regional read failed';
        var det = (err && err.details) || {};
        var action = det.action || det.requested_action || SRD_READ_ACTION;
        var reqId = det.request_id || det.requestId || null;
        var mismatch = !!SRD_NO_RETRY_CODES[code];
        var rg = _srdRegion_();
        if (rg) rg.set(mismatch ? window.KM.loadState.STATES.DEPLOYMENT_MISMATCH : window.KM.loadState.STATES.ERROR);
        var bits = 'action ' + esc(action) + ' · ' + esc(code) + (reqId ? ' · request ' + esc(reqId) : '');
        var retry = mismatch
            ? '<em>Retrying cannot fix this.</em> ' + esc(det.next_action || 'Publish a new Apps Script deployment version, then hard-reload the page.')
            : '<button type="button" class="srd-btn srd-btn--default" onclick="srdRetry()">Retry</button>';
        var note = el('srd-mode-note');
        if (note) note.innerHTML = '<span class="srd-note--error">Couldn’t load regional details: ' + esc(message) +
            ' [' + bits + ']. ' + retry + '</span>';
        _empty('SKU Regional read error.');
    }

    // Scoped read: Workspace (canonical) → getWorkspace('skuDetails', {include:{regional:true}}) → adapt → _srdReadModel.
    // Fail-closed (rejects; NO silent legacy broad fallback). Keeps the prior read-model until the new one is assigned.
    // The exact action this page depends on. Named here so the error banner and the deployment probe both refer to
    // the same string the transport actually sends.
    var SRD_READ_ACTION = 'skuDetails.workspace.get';
    function _srdWorkspaceRefresh_() {
        var mySeq = ++_srdReadSeq;
        var rg = _srdRegion_(); if (rg) rg.beginLoad(!!_srdReadModel);
        if (!(window.KM && window.KM.api && typeof window.KM.api.getWorkspace === 'function')) {
            return Promise.reject({ code: 'WORKSPACE_UNAVAILABLE', message: 'SKU Details Workspace API unavailable.' });
        }
        // PRICING-R2 — include.pricing rides the read this page ALREADY performs. A second request for the
        // prices would double the page's cold-start cost, and the broad Operation DB cache is the thing this
        // page deliberately stopped depending on; an un-requested include costs nothing server-side.
        return Promise.resolve(window.KM.api.getWorkspace('skuDetails', { include: { regional: true, pricing: true } })).then(function (env) {
            if (mySeq !== _srdReadSeq) return _srdReadModel;   // a newer read superseded this one
            if (env && env.success && env.data) {
                _srdReadModel = window.KM.DB.adaptSkuDetailsWorkspace(env.data);
                if (rg) rg.set((_srdReadModel.skuRegionalDetails && _srdReadModel.skuRegionalDetails.length) ? window.KM.loadState.STATES.READY : window.KM.loadState.STATES.EMPTY);
                return _srdReadModel;
            }
            throw (env && env.errors && env.errors[0]) || { code: 'SKU_REGIONAL_READ_FAILED', message: 'SKU Details workspace request failed.' };
        });
    }
    // Post-write reconcile: Workspace mode → scoped re-read then cb (primary render ignores the broad cache the writer
    // reloaded); Legacy mode → cb immediately (the writer already reloaded the broad cache).
    function _srdAfterWrite(cb) {
        if (!_srdEffectiveWorkspace()) { if (typeof cb === 'function') cb(); return; }
        _srdWorkspaceRefresh_().then(function () { if (typeof cb === 'function') cb(); }).catch(function (err) { _srdRenderError_(err); });
    }

    function _rows() { return _srdGetRegional(); }

    function srdToast(msg) {
        var t = el('srd-toast');
        if (!t) { t = document.createElement('div'); t.id = 'srd-toast'; t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#16a34a;color:#fff;padding:10px 18px;border-radius:8px;font-size:.85rem;z-index:2000;opacity:0;transition:opacity .3s;'; document.body.appendChild(t); }
        t.textContent = msg; t.style.opacity = '1';
        setTimeout(function () { t.style.opacity = '0'; }, 2600);
    }

    // ---- Joins (built once per render pass over the cached arrays) ----
    function buildIndexes() {
        _srdMasterIndex = {};
        var masters = _srdGetMasters();
        masters.forEach(function (m) { if (m && m.sku) _srdMasterIndex[lc(m.sku)] = m; });
        _srdMktIndex = {};
        var mkts = _srdGetMktSkus();
        mkts.forEach(function (m) {
            var k = lc(m.sku) + '||' + lc(m.company) + '||' + lc(m.country) + '||' + lc(m.marketplace);
            (_srdMktIndex[k] = _srdMktIndex[k] || []).push(m);
        });
    }
    function masterOf(r) { return _srdMasterIndex ? _srdMasterIndex[lc(r.sku)] : null; }
    function masterBySku(sku) { return _srdMasterIndex ? _srdMasterIndex[lc(sku)] : null; }
    function mName(m) { return m ? (m.productName || (m.raw && m.raw.product_name) || '') : ''; }
    function mSeries(m) { return m ? (m.series || (m.raw && m.raw.series) || '') : ''; }
    function mCategory(m) { return m ? ((m.raw && m.raw.category) || m.category || '') : ''; }

    // Operational status join — EXACTLY ONE marketplace_skus match required. Never first-row fallback.
    function statusOf(r) {
        var matches = (_srdMktIndex && _srdMktIndex[compositeKey(r)]) || [];
        if (matches.length === 0) return { kind: 'none', label: 'Not linked', launchDate: '' };
        if (matches.length > 1) return { kind: 'ambiguous', label: 'Ambiguous marketplace link', launchDate: '' };
        var s = String(matches[0].marketplaceSkuStatus || '').trim();
        var launch = String(matches[0].launchDate || '').trim();
        if (!s) return { kind: 'other', label: 'Not set', launchDate: launch };
        var kind = /inactive|closed|paused|delist/i.test(s) ? 'inactive' : (/active|live/i.test(s) ? 'active' : 'other');
        return { kind: kind, label: s, launchDate: launch };
    }

    // ---- Master SKU list (distinct SKUs that have ≥1 regional record) + filters ----
    function masterList() {
        var seen = {}, skus = [];
        _rows().forEach(function (r) { var k = lc(r.sku); if (k && !seen[k]) { seen[k] = 1; skus.push(r.sku); } });
        var f = srdState.filters, kw = lc(srdState.search);
        var entries = skus.map(function (sku) {
            var m = masterBySku(sku);
            return { sku: sku, name: mName(m), series: mSeries(m), category: mCategory(m) };
        }).filter(function (e) {
            // Multi-select filters: empty array = All; otherwise an OR-set membership test (§13/§15).
            if (f.category.length && f.category.map(lc).indexOf(lc(e.category)) === -1) return false;
            if (f.series.length && f.series.map(lc).indexOf(lc(e.series)) === -1) return false;
            if (kw) { if ([e.sku, e.name, e.series, e.category].map(lc).join(' ').indexOf(kw) === -1) return false; }
            return true;
        });
        entries.sort(function (a, b) { return String(a.sku).localeCompare(String(b.sku), undefined, { numeric: true, sensitivity: 'base' }); });
        return entries;
    }

    // ---- Filters (options from loaded sku_details; Category → Series → Search) ----
    function fillSelect(id, values, current, placeholder) {
        var sel = el(id); if (!sel) return;
        var opts = ['<option value="">' + esc(placeholder) + '</option>'];
        values.forEach(function (v) { opts.push('<option value="' + esc(v.value) + '"' + (String(current) === String(v.value) ? ' selected' : '') + '>' + esc(v.label) + '</option>'); });
        sel.innerHTML = opts.join('');
    }
    function distinct(arr) {
        var seen = {}, out = [];
        arr.forEach(function (v) { var k = String(v == null ? '' : v).trim(); if (k && !seen[lc(k)]) { seen[lc(k)] = 1; out.push(k); } });
        out.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); });
        return out;
    }
    function populateFilters() {
        var masters = _srdGetMasters();
        var cats = distinct(masters.map(function (m) { return (m.raw && m.raw.category) || m.category; }));
        var sers = distinct(masters.map(function (m) { return m.series || (m.raw && m.raw.series); }));
        // ONE shared searchable multi-select per filter (KM.ui.multiFilter). create() is idempotent:
        // re-calling it on the same mount just refreshes the option universe + selection (dynamic
        // options), so a data reload never stacks panels or duplicates listeners (§13/§15).
        _srdMountFilter('srd-f-category-mount', 'srd-cat', 'Category', cats, srdState.filters.category, 'All Categories');
        _srdMountFilter('srd-f-series-mount', 'srd-ser', 'Series', sers, srdState.filters.series, 'All Series');
        var s = el('srd-search'); if (s && s.value !== srdState.search) s.value = srdState.search;
    }
    function _srdMountFilter(mountId, filterId, label, values, selected, allText) {
        if (!(window.KM && window.KM.ui && window.KM.ui.multiFilter)) return;
        var name = mountId === 'srd-f-category-mount' ? 'category' : 'series';
        window.KM.ui.multiFilter.create({
            mount: mountId, filterId: filterId, label: label, allText: allText,
            options: values.map(function (v) { return { value: v, label: v }; }),
            selectedValues: selected,
            onChange: function (vals) { onFilterChange(name, vals); }
        });
    }

    // ---- Left list render ----
    function renderList(entries) {
        var wrap = el('srd-list'); if (!wrap) return;
        var total = entries.length;
        var pages = Math.max(1, Math.ceil(total / srdState.pageSize));
        if (srdState.page > pages) srdState.page = pages;
        var start = (srdState.page - 1) * srdState.pageSize;
        var pageRows = entries.slice(start, start + srdState.pageSize);

        if (!total) {
            wrap.innerHTML = '<div class="srd-empty">' + (_rows().length ? 'No Master SKUs match your filters.' : 'No SKU Regional Details rows yet.') + '</div>';
        } else {
            wrap.innerHTML = pageRows.map(function (e) {
                var sel = (lc(srdState.selectedSku) === lc(e.sku)) ? ' is-selected' : '';
                var sub = [e.series, e.category].filter(function (x) { return String(x || '').trim(); }).join(' · ');
                return '<div class="srd-item' + sel + '" role="option" tabindex="0" aria-selected="' + (sel ? 'true' : 'false') + '" data-sku="' + esc(e.sku) + '">' +
                    '<div class="srd-item__l1"><span class="srd-item__sku">' + esc(e.sku) + '</span></div>' +
                    (e.name ? '<div class="srd-item__ctx">' + esc(e.name) + '</div>' : '') +
                    (sub ? '<div class="srd-item__sub">' + esc(sub) + '</div>' : '') +
                '</div>';
            }).join('');
        }
        var pager = el('srd-pager');
        if (pager) {
            pager.innerHTML = '<span>' + total + ' SKU' + (total === 1 ? '' : 's') + '</span>' +
                '<span>Page ' + srdState.page + ' / ' + pages + '</span>' +
                '<span><button type="button" class="srd-btn srd-btn--ghost" ' + (srdState.page <= 1 ? 'disabled' : '') + ' onclick="srdPage(-1)">‹ Prev</button> ' +
                '<button type="button" class="srd-btn srd-btn--ghost" ' + (srdState.page >= pages ? 'disabled' : '') + ' onclick="srdPage(1)">Next ›</button></span>' +
                '<label>Page size <select onchange="srdPageSize(this.value)">' + [25, 50, 100].map(function (n) { return '<option value="' + n + '"' + (srdState.pageSize === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>';
        }
    }

    // ---- Country model ----
    function regionalRowsForSku(sku) { return _rows().filter(function (r) { return lc(r.sku) === lc(sku); }); }
    function countryTabs(sku) {
        var rows = regionalRowsForSku(sku);
        var present = {};    // UPPER → display label (original case)
        rows.forEach(function (r) { var c = String(r.country || '').trim(); if (c) present[up(c)] = present[up(c)] || c; });
        var ordered = [], usedUp = {};
        STANDARD_COUNTRIES.forEach(function (c) {
            usedUp[c] = 1;
            var cnt = rows.filter(function (r) { return up(r.country) === c; }).length;
            ordered.push({ code: c, label: c, count: cnt });
        });
        Object.keys(present).sort().forEach(function (u) {
            if (usedUp[u]) return;
            ordered.push({ code: u, label: present[u], count: rows.filter(function (r) { return up(r.country) === u; }).length });
        });
        return ordered;
    }
    function recordsForCountry(sku, code) {
        return regionalRowsForSku(sku).filter(function (r) { return up(r.country) === up(code); })
            .sort(function (a, b) {
                var c = lc(a.company).localeCompare(lc(b.company)); if (c) return c;
                var m = lc(a.marketplace).localeCompare(lc(b.marketplace)); if (m) return m;
                return String(rowKey(a)).localeCompare(String(rowKey(b)));
            });
    }

    // ---- Read-only Tax join (tax_referral_rates SSOT). Never first-row: Series + duty_country +
    // effective-date; deterministic latest effective_from (tiebreak origin, taxRateId). ----
    function todayIso() { try { return new Date().toISOString().slice(0, 10); } catch (e) { return ''; } }
    function resolveTax(sku, dutyCode) {
        var m = masterBySku(sku);
        var series = String(mSeries(m)).trim();
        if (!series) return { series: '', row: null, reason: 'no-series' };
        var rates = _srdGetTaxRates();
        var cands = rates.filter(function (t) { return lc(t.series) === lc(series) && up(t.dutyCountry) === up(dutyCode); });
        if (!cands.length) return { series: series, row: null, reason: 'none' };
        var t0 = todayIso();
        var applicable = cands.filter(function (t) {
            var f = String(t.effectiveFrom || ''), to = String(t.effectiveTo || '');
            return (!f || !t0 || f <= t0) && (!to || !t0 || to >= t0);
        });
        var pool = applicable.length ? applicable : cands;   // fall back to all candidates (still deterministic)
        pool = pool.slice().sort(function (a, b) {
            var fa = String(a.effectiveFrom || ''), fb = String(b.effectiveFrom || '');
            if (fa !== fb) return fb.localeCompare(fa);       // latest effective_from first
            var oa = String(a.countryOfOrigin || ''), ob = String(b.countryOfOrigin || ''); if (oa !== ob) return oa.localeCompare(ob);
            return String(a.taxRateId || '').localeCompare(String(b.taxRateId || ''));
        });
        var origins = {}; pool.forEach(function (t) { origins[up(t.countryOfOrigin)] = 1; });
        return { series: series, row: pool[0], multiOrigin: Object.keys(origins).length > 1, applicable: applicable.length > 0 };
    }
    function taxComponentsFor(taxRateId) {
        if (!taxRateId) return [];
        var comps = _srdGetTaxComponents();
        return comps.filter(function (c) { return String(c.taxRateId) === String(taxRateId); });
    }

    // ---- Detail rendering ----
    function fieldRow(k, v, isLink) {
        var val = String(v == null ? '' : v).trim();
        var disp = val ? (isLink ? '<a href="' + esc(val) + '" target="_blank" rel="noopener">link ↗</a>' : esc(val)) : '<span class="srd-muted">—</span>';
        return '<div class="srd-field"><span class="srd-field__k">' + esc(k) + '</span><span class="srd-field__v">' + disp + '</span></div>';
    }
    function statusText(st) { return st.kind === 'none' ? 'Not linked' : (st.kind === 'ambiguous' ? 'Ambiguous marketplace link' : st.label); }

    function renderDetail() {
        var panel = el('srd-detail'); if (!panel) return;
        var sku = srdState.selectedSku;
        if (!sku) { panel.classList.remove('srd-mobile-open'); panel.innerHTML = '<div class="srd-detail-empty">Select a Master SKU to view its regional records.</div>'; return; }
        var m = masterBySku(sku);
        var tabs = countryTabs(sku);
        // preserve active country if still a valid tab; else first with data; else first tab
        var codes = tabs.map(function (t) { return t.code; });
        if (!srdState.activeCountry || codes.indexOf(up(srdState.activeCountry)) === -1) {
            var firstData = tabs.filter(function (t) { return t.count > 0; })[0];
            srdState.activeCountry = (firstData ? firstData.code : (tabs[0] ? tabs[0].code : null));
        } else { srdState.activeCountry = up(srdState.activeCountry); }

        var records = srdState.activeCountry ? recordsForCountry(sku, srdState.activeCountry) : [];

        var header =
            '<div class="srd-dh"><div class="srd-dh__top"><div>' +
                '<button type="button" class="srd-btn srd-btn--ghost srd-back" onclick="srdBackToResults()">‹ Back</button>' +
                '<div class="srd-dh__sku" onclick="srdOpenMasterDrawer()" title="View Master SKU">' + esc(sku) + '</div>' +
                (mName(m) ? '<div class="srd-dh__name">' + esc(mName(m)) + (mSeries(m) ? ' · ' + esc(mSeries(m)) : '') + (mCategory(m) ? ' · ' + esc(mCategory(m)) : '') + '</div>' : '') +
            '</div><div class="srd-dh__actions">' +
                '<button type="button" class="srd-btn srd-btn--default" onclick="srdOpenMasterDrawer()">View Master SKU</button>' +
            '</div></div></div>';

        var ctabs = '<div class="srd-ctabs" role="tablist" aria-label="Countries">' + tabs.map(function (t) {
            var on = up(t.code) === up(srdState.activeCountry);
            var muted = t.count === 0 ? ' srd-ctab--muted' : '';
            var badge = t.count > 0 ? '<span class="srd-ctab__n">' + t.count + '</span>' : '<span class="srd-ctab__n">Not configured</span>';
            return '<button type="button" role="tab" class="srd-ctab' + muted + '" aria-selected="' + (on ? 'true' : 'false') + '" onclick="srdSetCountry(\'' + esc(t.code) + '\')">' + esc(t.label) + ' ' + badge + '</button>';
        }).join('') + '</div>';

        var body;
        if (!srdState.activeCountry) {
            body = '<div class="srd-notcfg"><p>No country records for this SKU.</p></div>';
        } else if (records.length === 0) {
            body = '<div class="srd-notcfg"><p><strong>' + esc(srdState.activeCountry) + '</strong> is not configured for ' + esc(sku) + '.</p>' +
                '<button type="button" class="srd-btn srd-btn--primary" onclick="srdAddForCountry()">Add ' + esc(srdState.activeCountry) + ' Regional Detail</button></div>';
        } else {
            var record = null, selectorHtml = '';
            if (records.length === 1) {
                record = records[0];
            } else {
                // Multiple Company·Marketplace records — deterministic selector, NEVER silent first pick.
                var match = null;
                for (var i = 0; i < records.length; i++) { if (rowKey(records[i]) === srdState.activeRecordKey) { match = records[i]; break; } }
                record = match;   // stays null until the user chooses
                selectorHtml = '<div class="srd-cmsel"><span class="srd-cmsel__lbl">' + records.length + ' records in ' + esc(srdState.activeCountry) + ' — choose one:</span>' +
                    records.map(function (r) {
                        var k = rowKey(r), pressed = (k === srdState.activeRecordKey);
                        return '<button type="button" class="srd-cmsel__opt" aria-pressed="' + (pressed ? 'true' : 'false') + '" onclick="srdSetRecord(\'' + esc(k) + '\')">' + esc(r.company || '—') + ' · ' + esc(r.marketplace || '—') + '</button>';
                    }).join('') + '</div>';
            }
            if (record) {
                body = selectorHtml + sectionNav(record) + '<div class="srd-tabbody" role="tabpanel">' + sectionBody(record, sku) + '</div>';
            } else {
                body = selectorHtml + '<div class="srd-notcfg"><p>Select a Company · Marketplace record above to view its details.</p></div>';
            }
        }
        panel.innerHTML = header + ctabs + body;
    }

    function sectionNav(record) {
        if (SECTIONS.indexOf(srdState.activeSection) === -1) srdState.activeSection = 'overview';
        return '<div class="srd-tabs" role="tablist">' + SECTIONS.map(function (t) {
            return '<button type="button" role="tab" class="srd-tab" aria-selected="' + (srdState.activeSection === t ? 'true' : 'false') + '" onclick="srdSetTab(\'' + t + '\')">' + SECTION_LABELS[t] + '</button>';
        }).join('') + '</div>';
    }

    function sectionBody(r, sku) {
        var m = masterBySku(sku);
        var st = statusOf(r);
        var pidLabel = isAmazon(r.marketplace) ? 'ASIN' : 'Marketplace Product ID';
        var editBtn = '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button type="button" class="srd-btn srd-btn--primary" onclick="srdOpenEdit(\'' + esc(rowKey(r)) + '\', \'edit\')">Edit Regional Detail</button></div>';

        if (srdState.activeSection === 'overview') {
            return fieldRow('Master SKU', r.sku) + fieldRow('Master Product Name', mName(m)) + fieldRow('Series', mSeries(m)) + fieldRow('Category', mCategory(m)) +
                fieldRow('Company', r.company) + fieldRow('Country', r.country) + fieldRow('Marketplace', r.marketplace) +
                fieldRow('Operational Status', statusText(st)) +
                '<div class="srd-secnote">Master data (name / series / category / battery / magnet) is owned by <strong>sku_details</strong> — use View Master SKU. This page edits only regional fields.</div>' + editBtn;
        }
        if (srdState.activeSection === 'marketplace') {
            return fieldRow('Company', r.company) + fieldRow('Country', r.country) + fieldRow('Marketplace', r.marketplace) +
                fieldRow('Site SKU', r.siteSku) + fieldRow(pidLabel, r.marketplaceProductId) + fieldRow('Product URL', r.productUrl, true) +
                fieldRow('Language', r.language) + fieldRow('Operational Status', statusText(st)) +
                (st.launchDate ? fieldRow('Launch Date', st.launchDate) : '') +
                (st.kind === 'ambiguous' ? '<div class="srd-taxwarn">Multiple marketplace_skus rows match this identity — operational status is ambiguous and not shown. Resolve the duplicate linkage.</div>' : '') +
                _srdPricingBlock(r) + editBtn;
        }
        if (srdState.activeSection === 'packaging') {
            return fieldRow('Packaging Regulation', r.packagingRegulation) + fieldRow('Regulation URL', r.regulationUrl, true) +
                fieldRow('Manual Version', r.manualVersion) + fieldRow('Label Version', r.labelVersion) + fieldRow('Language', r.language) + editBtn;
        }
        if (srdState.activeSection === 'compliance') {
            return fieldRow('Battery Regulation', r.batteryRegulation) + fieldRow('Regulation URL', r.regulationUrl, true) +
                '<div class="srd-secnote">Product battery/magnet type is owned by <strong>sku_details</strong> (Master SKU). Only regional compliance references are stored here.</div>' + editBtn;
        }
        if (srdState.activeSection === 'tax') {
            return taxSection(sku, r);
        }
        if (srdState.activeSection === 'audit') {
            return fieldRow('Created At', r.createdAt) + fieldRow('Updated At', r.updatedAt) +
                '<div class="srd-secnote">Change author is not tracked in the schema.</div><div class="srd-secnote">Detailed change history is not available.</div>';
        }
        return '';
    }

    // Tax & Commercial — READ-ONLY join. No write path. "Open HS Code & Tax Rates" navigates to the
    // canonical Series-scoped tax editor (sku_details.js).
    function taxSection(sku, r) {
        var openBtn = '<div style="margin-top:14px;"><button type="button" class="srd-btn srd-btn--default" onclick="srdOpenTaxEditor()">Open HS Code &amp; Tax Rates</button></div>';
        var priceNote = '<div class="srd-secnote">Pricing is owned by <strong>Pricing List</strong> (read-only here). Brand baseline prices are on the Master SKU.</div>';
        var tax = resolveTax(sku, srdState.activeCountry);
        if (!tax.series) {
            return '<div class="srd-secnote">This Master SKU has no <strong>Series</strong>; tax rates are maintained per Series in <code>tax_referral_rates</code>.</div>' + priceNote + openBtn;
        }
        if (!tax.row) {
            return '<div class="srd-secnote">No tax rate configured for Series <strong>' + esc(tax.series) + '</strong> → duty country <strong>' + esc(srdState.activeCountry) + '</strong>. Tax SSOT = <code>tax_referral_rates</code>.</div>' + priceNote + openBtn;
        }
        var t = tax.row;
        var route = (t.countryOfOrigin ? esc(t.countryOfOrigin) : '—') + ' → ' + (t.dutyCountry ? esc(t.dutyCountry) : '—');
        var pct = function (v) { return (v === '' || v == null) ? '' : (v + '%'); };
        var declared = (t.declaredValue === '' || t.declaredValue == null) ? '' : (t.declaredValue + (t.declaredCurrency ? ' ' + t.declaredCurrency : ''));
        var body = fieldRow('Country Route (origin → duty)', route) + fieldRow('HS Code', t.hscode) +
            fieldRow('Duty Rate', pct(t.dutyRate)) + fieldRow('Port Tax Rate', pct(t.portTaxRate)) +
            fieldRow('Referral Fee Rate', pct(t.referralFeeRate)) + fieldRow('Declared Value', declared) +
            fieldRow('Effective', (t.effectiveFrom || '—') + ' → ' + (String(t.effectiveTo || '').trim() ? esc(t.effectiveTo) : 'open-ended'));

        var comps = taxComponentsFor(t.taxRateId);
        var compHtml = '';
        if (comps.length) {   // hide the whole subsection when empty (no placeholder rows)
            compHtml = '<div class="srd-drawer__sec" style="margin-top:14px;">Tax Rate Components</div>' +
                '<table class="srd-comp"><thead><tr><th>Name / Type</th><th>Rate</th><th>Effective To</th></tr></thead><tbody>' +
                comps.map(function (c) {
                    var name = c.componentName || c.componentCode || c.componentType || '—';
                    var typ = c.componentType && c.componentName ? ' (' + esc(c.componentType) + ')' : '';
                    var rate = c.rateType === 'percentage' ? (c.rateValue + '%') : (c.amountPerUnit !== '' && c.amountPerUnit != null ? (c.amountPerUnit + ' ' + (c.amountCurrency || '') + '/' + (c.quantityUnit || '')) : (c.rateValue !== '' ? c.rateValue : '—'));
                    return '<tr><td>' + esc(name) + typ + '</td><td>' + esc(rate) + '</td><td>' + (String(c.effectiveTo || '').trim() ? esc(c.effectiveTo) : '∞') + '</td></tr>';
                }).join('') + '</tbody></table>';
        }
        var warn = tax.multiOrigin ? '<div class="srd-taxwarn">Multiple origin routes exist for this Series → duty country. Showing the latest effective (deterministic). Use “Open HS Code &amp; Tax Rates” to review all.</div>' : '';
        var applic = tax.applicable ? '' : '<div class="srd-taxwarn">No currently-effective row for today; showing the latest by effective date.</div>';
        return body + compHtml + warn + applic +
            '<div class="srd-secnote">Read-only join. Tax SSOT = <code>tax_referral_rates</code>; nothing here is written from Regional Detail.</div>' + priceNote + openBtn;
    }

    // PRICING-R2 — the site-price block for the Marketplace section, plus its Import / Update entry point.
    // Absent the module (a page loaded without it) this renders nothing rather than half a price panel.
    function _srdPricingBlock(r) {
        var P = _srdPricingApi(); if (!P) return '';
        var res = _srdResolvePricing(r);
        var head = '<div class="srd-drawer__sec" style="margin-top:16px;">Site Pricing</div>';
        var tools = '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button type="button" class="srd-btn srd-btn--default" onclick="srdOpenPriceImport()">Import / Update</button></div>';
        return head + P.sectionHtml(res) + tools;
    }

    // ---- Master SKU drawer (read-only) + Edit Master via shared form ----
    function srdOpenMasterDrawer() {
        var sku = srdState.selectedSku; if (!sku) return;
        var m = masterBySku(sku);
        var ov = el('srd-drawer-overlay'), dr = el('srd-drawer'); if (!ov || !dr) return;
        var raw = (m && m.raw) || {};
        var f = function (k, v) { return fieldRow(k, v); };
        var sec = function (t) { return '<div class="srd-drawer__sec">' + esc(t) + '</div>'; };
        if (!m) {
            dr.innerHTML = '<div class="srd-drawer__head"><div><strong>Master SKU</strong><div class="srd-dh__ctx">' + esc(sku) + '</div></div><button type="button" class="srd-x" aria-label="Close" onclick="srdCloseDrawer()">×</button></div>' +
                '<div class="srd-drawer__body"><div class="srd-empty">Master SKU record not found for ' + esc(sku) + ' (missing sku_details reference).</div></div>';
        } else {
            dr.innerHTML = '<div class="srd-drawer__head"><div><strong>Master SKU</strong><div class="srd-dh__ctx">' + esc(m.sku) + (mName(m) ? ' · ' + esc(mName(m)) : '') + '</div></div><button type="button" class="srd-x" aria-label="Close" onclick="srdCloseDrawer()">×</button></div>' +
                '<div class="srd-drawer__body">' +
                    sec('Basic') + f('SKU', m.sku) + f('Product Name', mName(m)) + f('Product Name CN', raw.product_name_cn) + f('Series', mSeries(m)) + f('Category', mCategory(m)) + f('Status', raw.lifecycle) +
                    sec('Dimensions & Weights') + f('Item (L×W×H)', [raw.item_length, raw.item_width, raw.item_height].filter(String).join(' × ')) + f('Item Weight', raw.item_weight) + f('Carton (L×W×H)', [raw.carton_length, raw.carton_width, raw.carton_height].filter(String).join(' × ')) + f('Units / Carton', raw.units_per_carton) +
                    sec('Attributes') + f('Material', raw.material) + f('Battery Type', raw.battery_type) + f('Magnet Type', raw.magnet_type) + f('Product Use', raw.product_use) +
                    sec('Master Sales Baseline') + f('Minimum Price', raw.minimum_price) + f('MSRP', raw.msrp) + f('Selling Price', raw.selling_price) + f('Base Currency', raw.base_currency) +
                    '<div class="srd-secnote">Baseline reference prices only. Live pricing = Pricing List. Tax = tax_referral_rates. Read-only here.</div>' +
                '</div>' +
                '<div class="srd-drawer__foot"><button type="button" class="srd-btn srd-btn--default" onclick="srdCloseDrawer()">Close</button>' +
                    (window.openSkuMasterForm ? '<button type="button" class="srd-btn srd-btn--primary" onclick="srdEditMaster()">Edit Master SKU</button>' : '') + '</div>';
        }
        ov.style.display = 'flex';
    }
    function srdCloseDrawer(e) { if (e && e.target && e.target.id !== 'srd-drawer-overlay' && e.type === 'click') return; var ov = el('srd-drawer-overlay'); if (ov) ov.style.display = 'none'; }
    function srdEditMaster() {
        var sku = srdState.selectedSku; if (!sku) return;
        if (window.selectSkuRow && window.openSkuMasterForm) {
            srdCloseDrawer();
            window.selectSkuRow(sku);
            window.openSkuMasterForm('edit');
        } else { srdToast('Master editor unavailable on this page.'); }
    }
    // Open the canonical Series-scoped Tax editor for the selected SKU (reuses sku-details.js).
    function srdOpenTaxEditor() {
        var sku = srdState.selectedSku; if (!sku) return;
        if (window.selectSkuRow && window.handleSkuTaxRates) {
            window.selectSkuRow(sku);
            window.handleSkuTaxRates();
        } else { srdToast('Tax editor unavailable on this page.'); }
    }

    // ---- Edit / Add Regional Detail modal ----
    function srdOpenEdit(key, mode, prefill) {
        if (!useDb() || !window.KM.DB.upsertSkuRegionalDetail) { srdToast('Enable the cloud DB to edit.'); return; }
        var isAdd = (mode === 'add');
        var r = isAdd ? null : findByKey(key);
        if (!isAdd && !r) { srdToast('Select a Regional record first.'); return; }
        var ov = el('srd-edit-overlay'), modal = el('srd-edit-modal'); if (!ov || !modal) return;
        _srdSaving = false;
        prefill = prefill || {};
        var identity = isAdd
            ? '<label>Master SKU<input id="srd-e-sku" type="text" value="' + esc(prefill.sku || '') + '"></label>' +
              '<label>Company<input id="srd-e-company" type="text" value="' + esc(prefill.company || '') + '"></label>' +
              '<label>Country<input id="srd-e-country" type="text" value="' + esc(prefill.country || '') + '"></label>' +
              '<label>Marketplace<input id="srd-e-marketplace" type="text" value="' + esc(prefill.marketplace || '') + '"></label>'
            : '<label>Master SKU<input id="srd-e-sku" type="text" value="' + esc(r.sku) + '" readonly></label>' +
              '<label>Company<input id="srd-e-company" type="text" value="' + esc(r.company) + '" readonly></label>' +
              '<label>Country<input id="srd-e-country" type="text" value="' + esc(r.country) + '" readonly></label>' +
              '<label>Marketplace<input id="srd-e-marketplace" type="text" value="' + esc(r.marketplace) + '" readonly></label>';
        var fields = EDIT_FIELDS.map(function (fd) {
            var v = r ? (r[fd.cc] || '') : '';
            var lbl = (fd.key === 'marketplace_product_id' && r && isAmazon(r.marketplace)) ? 'Marketplace Product ID (ASIN)' : fd.label;
            return '<label class="' + (fd.wide ? 'wide' : '') + '">' + esc(lbl) + '<input id="srd-e-' + fd.key + '" type="text" value="' + esc(v) + '"></label>';
        }).join('');
        // PRICING-R2 — the per-field price editor, on EDIT only. An Add has no marketplace_sku_id yet, so it
        // has no pricing row to own; offering the controls there would promise a write that cannot be aimed.
        _srdEditPricing = null;
        var priceHtml = '';
        var P = _srdPricingApi();
        if (!isAdd && P) {
            var res = _srdResolvePricing(r);
            if (res && res.state === 'OK') {
                _srdEditPricing = res;
                priceHtml = '<div class="srd-modal__sec">Site Pricing</div>' + P.editorHtml(res.row);
            }
        }
        modal.innerHTML =
            '<div class="srd-modal__head"><span>' + (isAdd ? 'Add Regional Detail' : 'Edit Regional Detail — ' + esc(r.sku)) + '</span><button type="button" class="srd-x" aria-label="Close" onclick="srdCloseEdit()">×</button></div>' +
            '<div class="srd-modal__body">' + identity + fields + priceHtml +
                '<p class="srd-modal__hint">Editing <strong>Site SKU</strong> / <strong>Marketplace Product ID</strong> also syncs the matching <code>marketplace_skus</code> row (Regional = higher-priority source). Tax and Master fields are not written here.</p>' +
            '</div>' +
            '<div class="srd-modal__foot"><button type="button" class="srd-btn srd-btn--default" onclick="srdCloseEdit()">Cancel</button>' +
                '<button type="button" class="srd-btn srd-btn--primary" id="srd-save-btn" onclick="srdSaveEdit(' + (isAdd ? 'true' : 'false') + ')">' + (isAdd ? 'Create' : 'Review Changes & Save') + '</button></div>';
        ov.style.display = 'flex';
    }
    // Add for the currently-selected SKU + active country tab.
    function srdAddForCountry() { srdOpenEdit(null, 'add', { sku: srdState.selectedSku || '', country: srdState.activeCountry || '' }); }

    function srdCloseEdit(e) { if (e && e.target && e.target.id !== 'srd-edit-overlay' && e.type === 'click') return; var ov = el('srd-edit-overlay'); if (ov) ov.style.display = 'none'; }
    function srdSaveEdit(isAdd) {
        if (_srdSaving) return;
        var g = function (id) { var e = el(id); return e ? String(e.value || '').trim() : ''; };
        var sku = g('srd-e-sku'), company = g('srd-e-company'), country = g('srd-e-country'), marketplace = g('srd-e-marketplace');
        if (!sku) { srdToast('Master SKU is required.'); return; }
        if (!country) { srdToast('Country is required.'); return; }
        if (!marketplace) { srdToast('Marketplace is required.'); return; }
        if (isAdd) {
            var dupe = _rows().some(function (r) { return lc(r.sku) === lc(sku) && lc(r.company) === lc(company) && lc(r.country) === lc(country) && lc(r.marketplace) === lc(marketplace); });
            if (dupe) { srdToast('A regional row for that SKU/company/country/marketplace already exists.'); return; }
        }
        var payload = { sku: sku, company: company, country: country, marketplace: marketplace, sync_marketplace_sku: true };
        EDIT_FIELDS.forEach(function (fd) { payload[fd.key] = g('srd-e-' + fd.key); });
        _srdSaving = true;
        var btn = el('srd-save-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        srdToast('Saving…');
        window.KM.DB.upsertSkuRegionalDetail(payload).then(function (data) {
            // PRICING-R2 — the price is a SEPARATE write to a SEPARATE owner, and it is not folded into the
            // regional payload: sku_regional_details has never held a price and must not start. When no price
            // control was touched, nothing is sent at all.
            var P = _srdPricingApi();
            if (!P || !_srdEditPricing) return data;
            var line = P.collectLine(_srdEditPricing.marketplaceSkuId,
                (_srdEditPricing.row && _srdEditPricing.row.currency) || '',
                function (id) { var e = el(id); return e ? e.value : ''; });
            if (!P.lineTouches(line)) return data;
            if (!window.KM.DB.updatePricing) { srdToast('Saved. Pricing was NOT saved: this build has no pricing writer.'); return data; }
            return window.KM.DB.updatePricing({ changed_by: 'sku-regional-details', change_reason: 'SKU Regional Details price editor', lines: [line] })
                .then(function (rec) { data = data || {}; data.__pricing = rec; return data; })
                .catch(function (perr) {
                    // The regional row DID save and the price did NOT. Saying "saved" would be a lie about
                    // half of it, so the failure is surfaced with its own reason and the price is unchanged.
                    data = data || {}; data.__pricingError = perr; return data;
                });
        }).then(function (data) {
            srdCloseEdit();
            srdState.selectedSku = sku;
            srdState.activeCountry = up(country);
            srdState.activeRecordKey = data && data.regional_detail_id ? data.regional_detail_id : (lc(sku) + '||' + lc(company) + '||' + lc(country) + '||' + lc(marketplace));
            // F1-7J-A: scoped post-write reconcile (Workspace → re-read skuDetails include.regional then render; Legacy →
            // render immediately, the writer already reloaded the broad cache). No page-level broad Operation DB reload.
            _srdAfterWrite(function () { render(); });
            var pmsg = '';
            if (data && data.__pricingError) {
                var pe = data.__pricingError;
                pmsg = ' PRICE NOT SAVED: ' + (pe.message || pe) + ' (the price is unchanged).';
            } else if (data && data.__pricing) {
                pmsg = ' ' + (data.__pricing.written || 0) + ' price row(s) written, ' + (data.__pricing.logged || 0) + ' audit entries.';
            }
            srdToast('Saved.' + (data && data.synced ? ' marketplace_skus identity synced.' : (data && data.synced === false ? ' (No matching marketplace_skus row to sync.)' : '')) + pmsg);
        }).catch(function (err) {
            _srdSaving = false;
            var b = el('srd-save-btn'); if (b) { b.disabled = false; b.textContent = isAdd ? 'Create' : 'Review Changes & Save'; }
            srdToast('Save failed: ' + (err && err.message ? err.message : err));
        });
    }
    function findByKey(key) { var rows = _rows(); for (var i = 0; i < rows.length; i++) if (rowKey(rows[i]) === key) return rows[i]; return null; }

    // ======================================================================================================
    // PRICING-R2 §6/§8/§9 — THE PRICE EDITOR'S CONTROLS AND THE TEMPLATE ROUND TRIP.
    // ======================================================================================================

    // MANUAL is the only mode that takes a number, so the box is enabled by the mode rather than the other
    // way round. A price typed and then switched to USE AUTO is ignored (§8), and the box is cleared so the
    // screen cannot show a number that will not be written.
    function srdPriceModeChanged(fieldKey) {
        var sel = el('srd-p-' + fieldKey + '-mode'), box = el('srd-p-' + fieldKey + '-value');
        if (!sel || !box) return;
        var manual = String(sel.value || '') === 'MANUAL';
        box.disabled = !manual;
        if (!manual) box.value = '';
        else box.focus();
    }

    // A file the browser hands to the operator. Same-origin Blob; no network, no service.
    function _srdDownload(filename, text) {
        try {
            var blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } catch (e) { srdToast('Download failed: ' + (e && e.message ? e.message : e)); }
    }

    function _srdImportOverlay() {
        var ov = el('srd-price-overlay');
        if (ov) return ov;
        ov = document.createElement('div');
        ov.id = 'srd-price-overlay';
        ov.className = 'srd-modal-overlay';
        ov.style.display = 'none';
        ov.innerHTML = '<div class="srd-modal" id="srd-price-modal"></div>';
        ov.addEventListener('click', function (e) { if (e.target === ov) srdClosePriceImport(); });
        // INSIDE the section, not on <body>: every rule in this page's stylesheet is scoped to
        // #sku-regional-details-section, so an overlay parented to the body would render as an unstyled
        // full-screen block — worse than no dialog. Falls back to the body only if the section is gone,
        // which cannot happen while this handler is reachable.
        (el('sku-regional-details-section') || document.body).appendChild(ov);
        return ov;
    }

    function srdOpenPriceImport() {
        var P = _srdPricingApi(); if (!P) { srdToast('Pricing module not loaded.'); return; }
        if (!useDb()) { srdToast('Enable the cloud DB to import prices.'); return; }
        _srdImportLines = null;
        var rows = _srdGetPricing();
        var census = P.census(rows);
        var ov = _srdImportOverlay(), modal = el('srd-price-modal');
        // The census is stated on the screen that offers to change prices, because it is the reason the
        // badges say "Not set": nothing is wrong with those rows, nobody has yet said who owns them.
        var censusHtml = '<div class="srd-secnote"><strong>' + census.total_rows + '</strong> pricing rows · ' +
            'ownership recorded for <strong>' + (census.fields.manual_provable + census.fields.auto_provable) + '</strong> of ' +
            (census.total_rows * P.FIELDS.length) + ' price fields (' +
            census.fields.manual_provable + ' manual, ' + census.fields.auto_provable + ' auto), ' +
            '<strong>' + census.fields.ambiguous + '</strong> not yet stated. ' +
            'Nothing classifies them automatically — an unstated field is left exactly as it is.</div>';
        modal.innerHTML =
            '<div class="srd-modal__head"><span>Price Import / Update</span>' +
            '<button type="button" class="srd-x" aria-label="Close" onclick="srdClosePriceImport()">×</button></div>' +
            '<div class="srd-modal__body">' + censusHtml +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
            '<button type="button" class="srd-btn srd-btn--default" onclick="srdDownloadPriceTemplate()">Download Price Update Template</button>' +
            '<button type="button" class="srd-btn srd-btn--default" onclick="srdDownloadCurrentPricing()">Download Current Regional Pricing</button>' +
            '</div>' +
            '<label class="wide">Upload Price Update Template<input id="srd-price-file" type="file" accept=".csv,text/csv"></label>' +
            '<div id="srd-price-preview" class="srd-secnote">Choose a file, then <strong>Preview</strong>. Nothing is written until you confirm.</div>' +
            '</div>' +
            '<div class="srd-modal__foot">' +
            '<button type="button" class="srd-btn srd-btn--default" onclick="srdClosePriceImport()">Cancel</button>' +
            '<button type="button" class="srd-btn srd-btn--default" id="srd-price-preview-btn" onclick="srdPreviewPriceImport()">Preview</button>' +
            '<button type="button" class="srd-btn srd-btn--primary" id="srd-price-confirm-btn" onclick="srdConfirmPriceImport()" disabled>Confirm &amp; Write</button>' +
            '</div>';
        ov.style.display = 'flex';
    }
    function srdClosePriceImport() {
        _srdImportLines = null;
        var ov = el('srd-price-overlay'); if (ov) ov.style.display = 'none';
    }

    function srdDownloadPriceTemplate() {
        var P = _srdPricingApi(); if (!P) return;
        var rows = _srdGetPricing();
        if (!rows.length) { srdToast('There are no pricing rows to template.'); return; }
        _srdDownload('price-update-template.csv', P.buildTemplateCsv(rows, _srdGetMktSkus()));
    }
    function srdDownloadCurrentPricing() {
        var P = _srdPricingApi(); if (!P) return;
        var rows = _srdGetPricing();
        if (!rows.length) { srdToast('There are no pricing rows to export.'); return; }
        _srdDownload('current-regional-pricing.csv', P.buildCurrentCsv(rows, _srdGetMktSkus()));
    }

    function _srdPriceErrorList(errors) {
        return '<ul class="srd-errs">' + errors.slice(0, 50).map(function (e) {
            return '<li>Line ' + (e.line || '?') + (e.field ? ' · ' + esc(e.field) : '') + ' — <strong>' + esc(e.code) + '</strong> ' + esc(e.detail || '') + '</li>';
        }).join('') + '</ul>' + (errors.length > 50 ? '<div class="srd-secnote">' + (errors.length - 50) + ' more not listed.</div>' : '');
    }

    /**
     * PREVIEW. Two validations, deliberately, and each is asked of whoever can answer it:
     *   the FILE is checked here   — required columns, a duplicate identity inside the file, a mode that is
     *                                not a mode, a MANUAL with no number;
     *   the DATABASE is checked by the server — whether the id exists, whether the currency agrees, whether
     *                                USE AUTO has anything to restore.
     * The second half is the SAME code path the write uses, run with dry_run, so what is shown here is what
     * would happen rather than a second implementation's opinion of it. NOTHING is written either way.
     */
    function srdPreviewPriceImport() {
        var P = _srdPricingApi(); if (!P) return;
        var input = el('srd-price-file'), out = el('srd-price-preview'), confirm = el('srd-price-confirm-btn');
        _srdImportLines = null;
        if (confirm) confirm.disabled = true;
        if (!input || !input.files || !input.files.length) { out.innerHTML = 'Choose a file first.'; return; }
        var reader = new FileReader();
        reader.onload = function () {
            var parsed = P.validateFile(String(reader.result || ''));
            if (!parsed.ok) {
                out.innerHTML = '<div class="srd-taxwarn">The file was rejected. <strong>Nothing was written.</strong></div>' + _srdPriceErrorList(parsed.errors);
                return;
            }
            var touched = parsed.lines.filter(function (l) { return P.lineTouches(l); });
            if (!touched.length) {
                out.innerHTML = '<div class="srd-secnote">The file is valid and asks for no changes — every field is NO_CHANGE. Nothing to write.</div>';
                return;
            }
            out.innerHTML = '<div class="srd-secnote">Checking ' + touched.length + ' row(s) against the database…</div>';
            window.KM.DB.updatePricing({ dry_run: true, changed_by: 'sku-regional-details',
                change_reason: 'Price template import (preview)', lines: touched })
                .then(function (rec) {
                    _srdImportLines = touched;
                    var changed = (rec.rows || []).filter(function (r) { return r.changed; });
                    var detail = changed.slice(0, 25).map(function (r) {
                        var per = P.FIELDS.filter(function (s) { return r.fields[s.key] && r.fields[s.key].changed; })
                            .map(function (s) { return s.label + ' → ' + r.fields[s.key].mode; }).join(', ');
                        return '<li><code>' + esc(r.marketplace_sku_id) + '</code> — ' + esc(per) + '</li>';
                    }).join('');
                    out.innerHTML = '<div class="srd-secnote"><strong>' + changed.length + '</strong> row(s) would change; ' +
                        (rec.unchanged_rows || 0) + ' already hold exactly this. Nothing has been written yet.</div>' +
                        '<ul class="srd-errs">' + detail + '</ul>' +
                        (changed.length > 25 ? '<div class="srd-secnote">' + (changed.length - 25) + ' more not listed.</div>' : '');
                    if (confirm) confirm.disabled = changed.length === 0;
                })
                .catch(function (err) {
                    out.innerHTML = '<div class="srd-taxwarn">The database rejected the file. <strong>Nothing was written.</strong> ' +
                        esc(err && err.message ? err.message : String(err)) + '</div>' + _srdPriceErrorList((err && err.errors) || []);
                });
        };
        reader.onerror = function () { out.innerHTML = 'Could not read that file.'; };
        reader.readAsText(input.files[0]);
    }

    /** CONFIRM. Writes exactly the lines the preview validated — never the file re-read a second time. */
    function srdConfirmPriceImport() {
        var P = _srdPricingApi(); if (!P) return;
        if (!_srdImportLines || !_srdImportLines.length) { srdToast('Preview the file first.'); return; }
        var btn = el('srd-price-confirm-btn'), out = el('srd-price-preview');
        if (btn) { btn.disabled = true; btn.textContent = 'Writing…'; }
        window.KM.DB.updatePricing({ changed_by: 'sku-regional-details',
            change_reason: 'Price template import', lines: _srdImportLines })
            .then(function (rec) {
                _srdImportLines = null;
                srdClosePriceImport();
                srdToast(rec.written + ' price row(s) written · ' + rec.logged + ' audit entries.');
                _srdAfterWrite(function () { render(); });
            })
            .catch(function (err) {
                if (btn) { btn.disabled = false; btn.textContent = 'Confirm & Write'; }
                if (out) out.innerHTML = _srdWriteFailureHtml_(err) + _srdPriceErrorList((err && err.errors) || []);
            });
    }

    // ---- Selection + tabs + paging ----
    function selectSku(sku) {
        srdState.selectedSku = sku; srdState.activeCountry = null; srdState.activeRecordKey = null; srdState.activeSection = 'overview';
        var list = el('srd-list'); if (list) list.querySelectorAll('.srd-item').forEach(function (it) { var on = lc(it.getAttribute('data-sku')) === lc(sku); it.classList.toggle('is-selected', on); it.setAttribute('aria-selected', on ? 'true' : 'false'); });
        renderDetail();
        if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) { var p = el('srd-detail'); if (p) p.classList.add('srd-mobile-open'); }
    }
    function srdSetCountry(code) {
        srdState.activeCountry = up(code);
        // if the new country has exactly one record, clear any stale record key; multi keeps user choice
        var recs = recordsForCountry(srdState.selectedSku, code);
        srdState.activeRecordKey = (recs.length === 1) ? rowKey(recs[0]) : null;
        srdState.activeSection = 'overview';
        renderDetail();
    }
    function srdSetRecord(key) { srdState.activeRecordKey = key; renderDetail(); }
    function srdBackToResults() { var p = el('srd-detail'); if (p) p.classList.remove('srd-mobile-open'); }
    function srdSetTab(t) { srdState.activeSection = t; renderDetail(); }
    function srdPage(delta) { srdState.page += delta; renderList(masterList()); }
    function srdPageSize(v) { srdState.pageSize = parseInt(v, 10) || 50; srdState.page = 1; renderList(masterList()); }

    // Filter change handler — `value` is the shared multi-select's selected-values array ([] = All).
    function onFilterChange(name, value) { srdState.filters[name] = Array.isArray(value) ? value : (value ? [value] : []); srdState.page = 1; render(); }

    // ---- Bind listeners once per section ----
    function bindOnce() {
        var sec = el('sku-regional-details-section'); if (!sec || sec.dataset.srdBound === '1') return; sec.dataset.srdBound = '1';
        var search = el('srd-search');
        if (search) search.addEventListener('input', function () { clearTimeout(_srdSearchTimer); var v = this.value; _srdSearchTimer = setTimeout(function () { srdState.search = v; srdState.page = 1; render(); }, 200); });
        // Category / Series now use the shared multi-select (KM.ui.multiFilter); it owns its own change
        // handling via onChange (wired in populateFilters) — no native <select> change listener here.
        var list = el('srd-list');
        if (list) {
            list.addEventListener('click', function (e) { var it = e.target.closest ? e.target.closest('.srd-item') : null; if (it) selectSku(it.getAttribute('data-sku')); });
            list.addEventListener('keydown', function (e) {
                var it = e.target.closest ? e.target.closest('.srd-item') : null; if (!it) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSku(it.getAttribute('data-sku')); }
                else if (e.key === 'ArrowDown' && it.nextElementSibling) { e.preventDefault(); it.nextElementSibling.focus(); }
                else if (e.key === 'ArrowUp' && it.previousElementSibling) { e.preventDefault(); it.previousElementSibling.focus(); }
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            var ovE = el('srd-edit-overlay'), ovD = el('srd-drawer-overlay');
            if (ovE && ovE.style.display !== 'none') { srdCloseEdit(); return; }
            if (ovD && ovD.style.display !== 'none') { srdCloseDrawer(); }
        });
    }

    // ---- Master render ----
    function render() {
        var wrap = el('srd-list'); if (!wrap) return;
        if (!useDb()) { _empty('Enable the cloud DB to view SKU Regional Details.'); return; }
        buildIndexes();
        var addBtn = el('srd-add-btn'); if (addBtn) addBtn.style.display = (useDb() && window.KM.DB.upsertSkuRegionalDetail) ? '' : 'none';
        populateFilters();
        var entries = masterList();
        // keep selection only if the SKU still appears; else clear honestly
        if (srdState.selectedSku && !entries.some(function (e) { return lc(e.sku) === lc(srdState.selectedSku); })) {
            srdState.selectedSku = null; srdState.activeCountry = null; srdState.activeRecordKey = null;
        }
        var count = el('srd-count'); if (count) count.textContent = entries.length + ' Master SKU' + (entries.length === 1 ? '' : 's') + ' · ' + _rows().length + ' regional records';
        renderList(entries);
        renderDetail();
    }
    function _empty(msg) { var w = el('srd-list'); if (w) w.innerHTML = '<div class="srd-empty">' + esc(msg) + '</div>'; var c = el('srd-count'); if (c) c.textContent = ''; }

    function loadAndInit() {
        var note = el('srd-mode-note');
        if (!el('sku-regional-details-section')) return;
        if (!useDb()) {
            if (note) note.innerHTML = '<span class="srd-note--demo">Connect the Operation DB (Google Sheet) to manage SKU Regional Details. No live data in demo mode.</span>';
            _empty('SKU Regional Details are stored in the Operation DB. Enable the cloud DB to use this page.');
            return;
        }
        if (note) note.innerHTML = '';
        bindOnce();
        // F1-7M-B2-HOTFIX same-session re-entry reuse: if the canonical read-model is already valid, render immediately
        // from it — no blocking skeleton, no duplicate workspace fetch. This-surface writes keep it fresh (_srdAfterWrite);
        // a failed load nulls it (_srdRenderError_) so Retry re-reads; _srdInvalidate_() drops it for external staleness.
        if (_srdEffectiveWorkspace() && _srdReadModel) { render(); return; }
        // in-flight dedupe: a rapid re-mount while the first fetch is still running must not issue a second request.
        if (_srdEffectiveWorkspace() && _srdInFlight) return;
        el('srd-list').innerHTML = '<div class="srd-skel"><span style="width:60%"></span><span style="width:80%"></span></div><div class="srd-skel"><span style="width:50%"></span><span style="width:70%"></span></div>';
        var seq = ++_srdReqSeq;
        var done = function () { if (seq !== _srdReqSeq) return; render(); };
        var fail = function () {
            if (seq !== _srdReqSeq) return;
            if (note) note.innerHTML = '<span class="srd-note--error">Couldn’t load regional details. <button type="button" class="srd-btn srd-btn--default" onclick="srdRetry()">Retry</button></span>';
        };
        // F1-7J-A: canonical → scoped skuDetails workspace (include.regional); NO broad Operation DB, fail-closed (no silent
        // legacy fallback). Legacy kill-switch mode retains the broad-cache load unchanged.
        if (_srdEffectiveWorkspace()) {
            _srdInFlight = true;
            _srdWorkspaceRefresh_().then(function () { _srdInFlight = false; if (seq !== _srdReqSeq) return; render(); }).catch(function (err) { _srdInFlight = false; if (seq !== _srdReqSeq) return; _srdRenderError_(err); });
        } else if (!window._opDbCache && window.KM.DB.loadOperationDb) {
            window.KM.DB.loadOperationDb({ force: true }).then(done).catch(fail);
        } else { done(); }
    }
    function srdRetry() { var n = el('srd-mode-note'); if (n) n.innerHTML = ''; loadAndInit(); }

    // Expose (inline handlers + lifecycle)
    // =====================================================================================================
    // PRICING-R4B — BULK UPDATE. One entry point, one scope, one write path.
    //
    // The pricing import contract was already proven and already wired; what was missing was a way to reach
    // it that an operator could find, and a TARGET for it. The old entry sat inside one SKU's Marketplace
    // tab and templated every pricing row in the workspace, so a "bulk update" meant downloading the whole
    // price book to change four rows in one country. This adds the page-level entry and scopes the file to
    // one country + one marketplace. It calls the SAME KM.DB.updatePricing, the SAME validator and the SAME
    // template builder — there is no second import contract here, only a gate in front of the first.
    // =====================================================================================================

    // Categories are a LIST so a second one is a row rather than a redesign. Only Pricing is implemented;
    // an unavailable category is shown disabled rather than hidden, because a category that appears the day
    // it ships is indistinguishable from one that was always there and simply never worked.
    var SRD_UPDATE_CATEGORIES = [
        { key: 'pricing', label: 'Pricing', available: true,
          description: 'Update marketplace-level Regular Price, Minimum Price and MSRP.' }
    ];

    var _srdBulk = null;

    function _srdBulkOverlay() {
        var ov = el('srd-bulk-overlay');
        if (ov) return ov;
        ov = document.createElement('div');
        ov.id = 'srd-bulk-overlay';
        ov.className = 'srd-modal-overlay';
        ov.innerHTML = '<div class="srd-modal srd-modal--wide" id="srd-bulk-modal" role="dialog" aria-modal="true" aria-label="Update Regional SKU Data"></div>';
        ov.addEventListener('click', function (e) { if (e.target === ov) srdCloseBulkUpdate(); });
        // Inside the section: every rule in this stylesheet is scoped to #sku-regional-details-section.
        (el('sku-regional-details-section') || document.body).appendChild(ov);
        return ov;
    }

    function srdOpenBulkUpdate() {
        var P = _srdPricingApi();
        if (!P) { srdToast('Pricing module not loaded.'); return; }
        if (!useDb()) { srdToast('Enable the cloud DB to run a bulk update.'); return; }
        _srdBulk = { category: null, country: '', scopeKey: '', scope: null, stage: 'category',
            fileName: null, lines: null, preview: null, shown: 0, result: null,
            scopes: P.scopes(_srdGetPricing(), _srdGetMktSkus()) };
        _srdBulkOverlay();
        _srdBulkPaintedStage_ = null;   // a fresh open has no position to preserve
        _srdBulkRender();
        el('srd-bulk-overlay').style.display = 'flex';
    }
    function srdCloseBulkUpdate() {
        _srdBulk = null;
        _srdBulkPaintedStage_ = null;
        var ov = el('srd-bulk-overlay'); if (ov) ov.style.display = 'none';
    }

    function srdBulkPickCategory(key) {
        if (!_srdBulk) return;
        var cat = SRD_UPDATE_CATEGORIES.filter(function (c) { return c.key === key && c.available; })[0];
        if (!cat) return;
        _srdBulk.category = cat; _srdBulk.stage = 'scope';
        _srdBulkRender();
    }
    function srdBulkSetCountry(c) {
        if (!_srdBulk) return;
        _srdBulk.country = String(c || '').trim().toUpperCase();
        _srdBulk.scopeKey = ''; _srdBulk.scope = null;
        _srdBulkReset();
        _srdBulkRender();
    }
    function srdBulkSetMarketplace(key) {
        if (!_srdBulk) return;
        var P = _srdPricingApi(); if (!P) return;
        _srdBulk.scopeKey = String(key || '');
        _srdBulk.scope = P.findScope(_srdBulk.scopes, _srdBulk.scopeKey);
        _srdBulkReset();
        _srdBulkRender();
    }
    /** Changing the target throws away anything validated against the previous one. */
    function _srdBulkReset() {
        _srdBulk.fileName = null; _srdBulk.lines = null; _srdBulk.preview = null; _srdBulk.result = null;
        _srdBulk.shown = 0;
        if (_srdBulk.stage === 'preview' || _srdBulk.stage === 'confirm') _srdBulk.stage = 'scope';
    }

    function _srdScopeLabel(sc) {
        return sc.country + ' · ' + sc.marketplace;
    }

    function _srdBulkTargetHtml() {
        var P = _srdPricingApi();
        var b = _srdBulk;
        var countries = P.countriesOf(b.scopes);
        if (!countries.length) {
            return '<div class="srd-taxwarn">No pricing rows are loaded, so there is no target to update. ' +
                'Pricing rows are created with the marketplace SKU; this screen never creates one.</div>';
        }
        var forCountry = b.country ? P.scopesForCountry(b.scopes, b.country) : [];
        var countryOpts = ['<option value="">Select a country…</option>'].concat(countries.map(function (c) {
            return '<option value="' + esc(c) + '"' + (b.country === c ? ' selected' : '') + '>' + esc(c) + '</option>';
        })).join('');
        var mktOpts = ['<option value="">Select a marketplace / site…</option>'].concat(forCountry.map(function (sc) {
            return '<option value="' + esc(sc.key) + '"' + (b.scopeKey === sc.key ? ' selected' : '') + '>' +
                esc(sc.marketplace) + ' (' + sc.rowCount + ' row' + (sc.rowCount === 1 ? '' : 's') + ')</option>';
        })).join('');

        var notice = '';
        if (b.scope) {
            if (b.scope.currency) {
                notice = '<div class="srd-bulk__cur">' +
                    '<strong>Pricing updates for this target use ' + esc(b.scope.currency) + '.</strong>' +
                    '<div>All Regular Price, Minimum Price and MSRP values in the uploaded file must use ' +
                    esc(b.scope.currency) + '. The currency is set by the selected marketplace and cannot be ' +
                    'changed through this import.</div></div>';
            } else {
                notice = '<div class="srd-taxwarn"><strong>This target cannot be imported.</strong> Its pricing rows carry ' +
                    (b.scope.currencyList.length ? 'more than one currency (' + esc(b.scope.currencyList.join(', ')) + ')' : 'no currency') +
                    ', so there is no single currency to validate an upload against. Resolve that in pricing_list first — ' +
                    'an import must not choose between them.</div>';
            }
        }
        var chosen = b.scope ? '<div class="srd-bulk__target">' +
            '<div><span>Country</span><strong>' + esc(b.scope.country) + '</strong></div>' +
            '<div><span>Marketplace / Site</span><strong>' + esc(b.scope.marketplace) + '</strong></div>' +
            '<div><span>Currency</span><strong>' + esc(b.scope.currency || 'not determinable') + '</strong></div>' +
            (b.scope.companyList.length > 1 ? '<div><span>Companies</span><strong>' + esc(b.scope.companyList.join(', ')) + '</strong></div>' : '') +
            '</div>' : '';

        return '<label class="wide">Country<select id="srd-bulk-country" onchange="srdBulkSetCountry(this.value)">' + countryOpts + '</select></label>' +
            '<label class="wide">Marketplace / Site<select id="srd-bulk-mkt" onchange="srdBulkSetMarketplace(this.value)"' +
            (b.country ? '' : ' disabled') + '>' + mktOpts + '</select></label>' + chosen + notice;
    }

    /**
     * §5 — HOW TO UPDATE PRICES, next to the buttons it is about.
     *
     * The three rules are generated from SRP.ACTIONS rather than written out here, so the words on this
     * screen, the words in the template and the words the parser accepts cannot drift apart: there is one
     * list and three readers of it.
     *
     * VISUALLY SECONDARY, deliberately. This is a reminder for someone who has done it before, not a manual
     * for someone who has not — a block that shouts competes with the target and the file name, which are
     * the two things a person must actually check before uploading.
     */
    function _srdBulkHowToHtml() {
        var P = _srdPricingApi(), b = _srdBulk;
        if (!P || !b.scope || !b.scope.currency) return '';
        var rules = P.ACTIONS.map(function (a) {
            return '<li><strong>' + esc(a.label) + '</strong> — ' + esc(a.help) + '</li>';
        }).join('');
        return '<div class="srd-bulk__how">' +
            '<div class="srd-bulk__how-h">How to update prices</div>' +
            '<ul>' + rules + '</ul>' +
            '<div class="srd-bulk__how-t">' +
            '<span>Target <strong>' + esc(b.scope.country) + ' · ' + esc(b.scope.marketplace) + '</strong></span>' +
            '<span>Currency <strong>' + esc(b.scope.currency) + '</strong></span>' +
            '</div>' +
            '<div class="srd-bulk__how-n">All prices entered in this file must be in ' + esc(b.scope.currency) +
            '. The action column and its price column are a pair: the action says what to do, the price ' +
            'column carries the number only when the action asks for one.</div>' +
            '</div>';
    }

    function _srdBulkFilesHtml() {
        var P = _srdPricingApi(), b = _srdBulk;
        if (!P || !b.scope || !b.scope.currency) return '';
        return '<div class="srd-bulk__files">' +
            '<button type="button" class="srd-btn srd-btn--default" onclick="srdBulkDownloadCurrent()">Download Current Pricing</button>' +
            '<button type="button" class="srd-btn srd-btn--primary" onclick="srdBulkDownloadTemplate()">Download Update Template (Excel)</button>' +
            '</div>' +
            '<div class="srd-bulk__adv"><button type="button" class="srd-linkbtn" ' +
            'onclick="srdBulkDownloadTemplateCsv()">Advanced: download the CSV template instead</button></div>' +
            _srdBulkHowToHtml() +
            '<div class="srd-secnote">Current Pricing is your rollback reference — download and keep it before uploading anything. ' +
            'The template covers only this target; every action ships as <strong>' + esc(P.actionLabel('NO_CHANGE')) +
            '</strong> with a blank price, so an unedited upload changes nothing.</div>' +
            '<label class="wide">Upload Pricing Update<input id="srd-bulk-file" type="file" ' +
            'accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv">' +
            '</label>';
    }

    /* =============================================================================================
       S3-R11 §12 — RE-RENDERING WITHOUT THROWING AWAY WHERE THE OPERATOR WAS.

       THE DEFECT, PRECISELY. Nothing here ever scrolled anything. `_srdBulkPaint_` redraws by
       assigning `modal.innerHTML`, which DESTROYS `.srd-modal__body` and builds a new one — and a
       brand-new element's scrollTop is 0. The operator reported "the modal jumps to the top after
       Preview"; what actually happened is that the element holding their position stopped existing.
       That is why there is no scrollIntoView call to delete: the fix has to carry the position
       across the replacement by hand.

       THE RULE, AND WHY IT NEEDS NO FLAG AT THE CALL SITES. A STAGE CHANGE IS A NEW PAGE and starts
       at the top — category to scope, scope to confirm, confirm to result. A re-render WITHIN a
       stage is the same page redrawn, and keeps the position. Preview and Show More are both
       within-stage, which is exactly the two places the jump was felt, and neither call site has to
       remember to ask.

       BOTH SCROLLERS, because there are two: the modal body, and the `.srd-bulk__cards` list nested
       inside it with its own max-height. Show More appends into the inner one, so restoring only the
       outer would still have thrown the operator back to the first card. */
    var _srdBulkPaintedStage_ = null;

    function _srdBulkScrollers_() {
        var modal = el('srd-bulk-modal');
        if (!modal) return { body: null, cards: null };
        return { body: modal.querySelector('.srd-modal__body'),
                 cards: modal.querySelector('.srd-bulk__cards') };
    }
    /** Clamp, because the new content may be shorter than the old — a stale offset would show blank. */
    function _srdBulkSetTop_(elm, top) {
        if (!elm || !top) return;
        elm.scrollTop = Math.max(0, Math.min(top, elm.scrollHeight - elm.clientHeight));
    }
    /**
     * §12 — THE MINIMAL SCROLL, AND ONLY WHEN ONE IS NEEDED.
     * Already in view: do nothing at all. Above the viewport: bring its top to the top edge. Below:
     * move by the smaller of the two distances that reveal it — its bottom to the bottom edge when it
     * fits, its top to the top edge when it is taller than the viewport and cannot fit either way.
     * Never scrollIntoView, which repositions even when the element is already perfectly visible.
     */
    function _srdBulkReveal_(body, id) {
        if (!body) return;
        var pv = el(id); if (!pv) return;
        var top = pv.offsetTop, bottom = top + pv.offsetHeight;
        var viewTop = body.scrollTop, viewBottom = viewTop + body.clientHeight;
        if (top >= viewTop && top < viewBottom) return;          // its start is already on screen
        if (top < viewTop) { _srdBulkSetTop_(body, top); return; }
        _srdBulkSetTop_(body, Math.min(top, bottom - body.clientHeight));
    }

    /**
     * Redraw the bulk modal. `opts.reveal` is passed only by Preview, which produced something the
     * operator asked to see; every other caller redraws in place.
     */
    function _srdBulkRender(opts) {
        var was = _srdBulkScrollers_();
        var wasStage = _srdBulkPaintedStage_;
        var wasBodyTop = was.body ? was.body.scrollTop : 0;
        var wasCardsTop = was.cards ? was.cards.scrollTop : 0;

        _srdBulkPaint_();

        _srdBulkPaintedStage_ = _srdBulk ? _srdBulk.stage : null;
        var now = _srdBulkScrollers_();
        if (wasStage !== null && wasStage === _srdBulkPaintedStage_) {
            _srdBulkSetTop_(now.body, wasBodyTop);
            _srdBulkSetTop_(now.cards, wasCardsTop);
        }
        if (opts && opts.reveal) _srdBulkReveal_(now.body, 'srd-bulk-preview');
    }

    function _srdBulkPaint_() {
        var b = _srdBulk; if (!b) return;
        var modal = el('srd-bulk-modal'); if (!modal) return;
        var head = '<div class="srd-modal__head"><span>Update Regional SKU Data</span>' +
            '<button type="button" class="srd-x" aria-label="Close" onclick="srdCloseBulkUpdate()">×</button></div>';

        if (b.stage === 'category') {
            var cards = SRD_UPDATE_CATEGORIES.map(function (c) {
                return '<button type="button" class="srd-bulk__cat" ' +
                    (c.available ? 'onclick="srdBulkPickCategory(\'' + c.key + '\')"' : 'disabled') + '>' +
                    '<strong>' + esc(c.label) + '</strong><span>' + esc(c.description) + '</span>' +
                    (c.available ? '' : '<em>Not available yet</em>') + '</button>';
            }).join('');
            modal.innerHTML = head +
                '<div class="srd-modal__body srd-modal__body--flow"><div class="srd-secnote">What are you updating?</div>' + cards + '</div>' +
                '<div class="srd-modal__foot"><button type="button" class="srd-btn srd-btn--default" onclick="srdCloseBulkUpdate()">Cancel</button></div>';
            return;
        }

        if (b.stage === 'result') {
            var s = b.result.summary;
            modal.innerHTML = head +
                '<div class="srd-modal__body srd-modal__body--flow"><div class="srd-bulk__ok"><strong>Pricing update completed.</strong></div>' +
                '<div class="srd-bulk__target">' +
                '<div><span>Rows updated</span><strong>' + s.rows_updated + '</strong></div>' +
                '<div><span>Fields updated</span><strong>' + s.fields_updated + '</strong></div>' +
                '<div><span>Updated by you</span><strong>' + s.manual_fields + '</strong></div>' +
                '<div><span>Returned to Auto</span><strong>' + s.auto_fields + '</strong></div>' +
                '</div><div class="srd-secnote">' + b.result.logged + ' audit entries written to pricing_change_log.</div></div>' +
                '<div class="srd-modal__foot">' +
                '<button type="button" class="srd-btn srd-btn--default" onclick="srdBulkDownloadResult()">Download Result</button>' +
                '<button type="button" class="srd-btn srd-btn--primary" onclick="srdCloseBulkUpdate()">Close</button></div>';
            return;
        }

        if (b.stage === 'confirm') {
            // §11 — WHAT WILL BE WRITTEN, not what was read. "87 price changes" is the number a person is
            // agreeing to; "100 rows uploaded" is a fact about a file and agreeing to it means nothing.
            var P2 = _srdPricingApi();
            var sm = b.preview.summary;
            var fieldBits = P2.FIELDS.map(function (spec) {
                return '<div><span>' + esc(spec.label) + '</span><strong>' + (sm.byField[spec.key] || 0) + '</strong></div>';
            }).join('');
            modal.innerHTML = head +
                '<div class="srd-modal__body srd-modal__body--flow"><div class="srd-bulk__confirm">' +
                '<div class="srd-bulk__confirm-n">' + sm.fieldChanges + ' price change' + (sm.fieldChanges === 1 ? '' : 's') +
                ' across ' + b.preview.changedRows + ' SKU' + (b.preview.changedRows === 1 ? '' : 's') + '</div>' +
                '<div class="srd-bulk__target">' +
                '<div><span>Country</span><strong>' + esc(b.scope.country) + '</strong></div>' +
                '<div><span>Marketplace</span><strong>' + esc(b.scope.marketplace) + '</strong></div>' +
                '<div><span>Currency</span><strong>' + esc(b.scope.currency) + '</strong></div></div>' +
                '<div class="srd-bulk__target">' + fieldBits + '</div>' +
                '<div class="srd-bulk__target">' +
                '<div><span>' + esc(P2.actionLabel('MANUAL')) + '</span><strong>' + sm.byAction.MANUAL + '</strong></div>' +
                '<div><span>' + esc(P2.actionLabel('AUTO')) + '</span><strong>' + sm.byAction.AUTO + '</strong></div>' +
                '<div><span>Errors</span><strong>' + (sm.rowsRejected || sm.errorCount) + '</strong></div></div>' +
                '<p class="srd-modal__hint">Each price updated this way becomes <strong>' + esc(P2.ownerLabel('MANUAL')) +
                '</strong> and a later FX run will leave it alone. ' + esc(P2.actionLabel('AUTO')) + ' hands the field ' +
                'back to the system, so FX may refresh it again.</p>' +
                '<p>Write these changes?</p></div></div>' +
                '<div class="srd-modal__foot">' +
                '<button type="button" class="srd-btn srd-btn--default" onclick="srdBulkBackToPreview()">Cancel</button>' +
                '<button type="button" class="srd-btn srd-btn--primary" id="srd-bulk-confirm-btn" onclick="srdBulkConfirm()">Write ' +
                sm.fieldChanges + ' Price Change' + (sm.fieldChanges === 1 ? '' : 's') + '</button></div>';
            return;
        }

        // scope / preview
        modal.innerHTML = head +
            '<div class="srd-modal__body srd-modal__body--flow">' +
            '<div class="srd-secnote"><strong>' + esc(b.category.label) + '</strong> — ' + esc(b.category.description) + '</div>' +
            _srdBulkTargetHtml() + _srdBulkFilesHtml() +
            '<div id="srd-bulk-preview">' + _srdBulkPreviewHtml() + '</div></div>' +
            '<div class="srd-modal__foot">' +
            '<button type="button" class="srd-btn srd-btn--default" onclick="srdCloseBulkUpdate()">Cancel</button>' +
            '<button type="button" class="srd-btn srd-btn--default" id="srd-bulk-preview-btn" onclick="srdBulkPreview()"' +
            (b.scope && b.scope.currency ? '' : ' disabled') + '>Preview</button>' +
            '<button type="button" class="srd-btn srd-btn--primary" id="srd-bulk-continue-btn" onclick="srdBulkToConfirm()"' +
            (b.preview && b.preview.changedRows > 0 ? '' : ' disabled') + '>Confirm Update</button></div>';
    }

    function srdBulkDownloadCurrent() {
        var P = _srdPricingApi(), b = _srdBulk; if (!P || !b || !b.scope) return;
        _srdDownload('current-pricing-' + b.scope.country + '-' + b.scope.marketplace + '.csv',
            P.buildCurrentCsv(b.scope.rows, _srdGetMktSkus()));
    }
    /* =============================================================================================
       S3-R11 §11 — XLSX IS THE OPERATOR TEMPLATE; CSV IS THE TECHNICAL FALLBACK.

       The reason is the action column. It is a three-word enum, and a CSV cannot refuse a fourth
       word — buildTemplateCsv's own comment says the file "cannot stop a wrong word being typed".
       An XLSX can, with a dropdown, which moves MODE_UNSUPPORTED from a round trip through the
       importer to the moment of typing.

       IT FALLS BACK RATHER THAN FAILING. KM.templateExport rejects when ExcelJS is not loaded (a
       blocked CDN, an offline shell). An operator who asked for a template should get a template, so
       that rejection produces the CSV and says so, instead of a toast about a missing library. */
    function srdBulkDownloadTemplate() {
        var P = _srdPricingApi(), b = _srdBulk; if (!P || !b || !b.scope) return;
        var tx = (window.KM && window.KM.templateExport) ? window.KM.templateExport : null;
        if (!tx || !tx.isReady || !tx.isReady()) { _srdBulkDownloadTemplateCsv_(true); return; }
        try {
            tx.buildAndDownload(P.templateXlsxSpec(b.scope, b.scope.rows, _srdGetMktSkus()))
              .catch(function () { _srdBulkDownloadTemplateCsv_(true); });
        } catch (e) { _srdBulkDownloadTemplateCsv_(true); }
    }
    /** The CSV template. Reachable on purpose (advanced action) and as the XLSX fallback. */
    function _srdBulkDownloadTemplateCsv_(wasFallback) {
        var P = _srdPricingApi(), b = _srdBulk; if (!P || !b || !b.scope) return;
        _srdDownload('price-update-template-' + b.scope.country + '-' + b.scope.marketplace + '.csv',
            P.buildTemplateCsv(b.scope.rows, _srdGetMktSkus()));
        if (wasFallback) srdToast('Excel export is unavailable here — downloaded the CSV template instead.');
    }
    function srdBulkDownloadTemplateCsv() { _srdBulkDownloadTemplateCsv_(false); }

    function _srdBulkErrs(errors) {
        return '<ul class="srd-errs">' + errors.slice(0, 50).map(function (e) {
            return '<li>' + (e.line ? 'Line ' + e.line : (e.marketplace_sku_id ? '<code>' + esc(e.marketplace_sku_id) + '</code>' : 'File')) +
                (e.field ? ' · ' + esc(e.field) : '') + ' — <strong>' + esc(e.code) + '</strong> ' + esc(e.detail || '') + '</li>';
        }).join('') + '</ul>' + (errors.length > 50 ? '<div class="srd-secnote">' + (errors.length - 50) + ' more not listed.</div>' : '');
    }

    /**
     * PREVIEW. Two validations, each asked of whoever can answer it — the file and the target here, the
     * database on the server's dry run. The dry run is the SAME code path the write uses, so what is shown
     * is what would happen rather than a second implementation's opinion of it. Nothing is written either way.
     */
    /* S3-R11 §11 — AN XLSX TEMPLATE THE OPERATOR CANNOT UPLOAD BACK IS A TRAP, so the reader admits
       both. This is a TRANSPORT change, not a change of import semantics: an .xlsx becomes the same
       grid a .csv becomes, and the grid meets SRP.validateBulkGrid — the same rules, the same error
       codes, the same dry run. Detection is by the ZIP magic bytes rather than the extension, because
       a renamed file is the operator's honest mistake and "PK" is what actually decides how to read
       it; the extension is only the hint used when the bytes are unavailable. */
    function _srdReadPricingGrid_(file, P) {
        var isXlsx = /\.xlsx$/i.test(file.name || '');
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('unreadable')); };
            if (!isXlsx) {
                reader.onload = function () { resolve(P.parseCsv(String(reader.result || ''))); };
                reader.readAsText(file);
                return;
            }
            reader.onload = function () {
                var buf = reader.result;
                var XL = window.ExcelJS;
                if (!XL || !XL.Workbook) {
                    reject(new Error('This browser session cannot read .xlsx files. '
                        + 'Download the CSV template (Advanced) and upload that instead.'));
                    return;
                }
                var wb = new XL.Workbook();
                Promise.resolve(wb.xlsx.load(buf)).then(function () {
                    // The FIRST worksheet that carries the identity column. The template writes one
                    // data sheet plus a veryHidden _SYSTEM sheet, and an operator may have added
                    // their own notes tab; picking by shape rather than by index survives both.
                    var grid = [];
                    wb.eachSheet(function (ws) {
                        if (grid.length) return;
                        var g = P.sheetToGrid(ws);
                        if (g.length) grid = g;
                    });
                    resolve(grid);
                }).catch(function () {
                    reject(new Error('That .xlsx could not be opened. If it was exported from another '
                        + 'tool, save it as .csv and upload that.'));
                });
            };
            reader.readAsArrayBuffer(file);
        });
    }

    function srdBulkPreview() {
        var P = _srdPricingApi(), b = _srdBulk; if (!P || !b || !b.scope) return;
        var input = el('srd-bulk-file'), out = el('srd-bulk-preview');
        b.preview = null; b.lines = null;
        var cont = el('srd-bulk-continue-btn'); if (cont) cont.disabled = true;
        if (!input || !input.files || !input.files.length) { out.innerHTML = '<div class="srd-secnote">Choose a file first.</div>'; return; }
        b.fileName = input.files[0].name;
        out.innerHTML = '<div class="srd-secnote">Reading ' + esc(b.fileName) + '…</div>';
        _srdReadPricingGrid_(input.files[0], P).then(function (grid) {
            b.shown = 0;
            var parsed = P.validateBulkGrid(grid, b.scope);
            if (!parsed.ok) {
                b.preview = { changedRows: 0, rejected: true, errors: parsed.errors, summary: null, groups: [] };
                _srdBulkRender({ reveal: true }); return;
            }
            var touched = parsed.lines.filter(function (l) { return P.lineTouches(l); });
            if (!touched.length) {
                // §7 — a file of pure No Change is a SUMMARY, not an empty table. It parsed, it was
                // understood, and the honest answer is the count rather than a blank panel.
                b.preview = { changedRows: 0, noop: true, errors: [], groups: [],
                    summary: P.previewSummary(parsed, [], []) };
                _srdBulkRender({ reveal: true }); return;
            }
            out.innerHTML = '<div class="srd-secnote">Checking ' + touched.length + ' row(s) against the database…</div>';
            window.KM.DB.updatePricing({ dry_run: true, changed_by: 'sku-regional-details',
                change_reason: 'Bulk pricing update (preview) ' + b.scope.country + '/' + b.scope.marketplace,
                lines: touched })
                .then(function (rec) {
                    b.lines = touched;
                    var rows = P.previewRows(rec.rows, touched, _srdGetPricing());
                    var changed = (rec.rows || []).filter(function (x) { return x.changed; });
                    b.previewRows = rows;
                    b.preview = {
                        changedRows: changed.length, errors: [],
                        summary: P.previewSummary(parsed, rec.rows, rows),
                        groups: P.groupPreview(rows)
                    };
                    _srdBulkRender({ reveal: true });
                })
                .catch(function (err) {
                    b.preview = { changedRows: 0, rejected: true, serverMessage: (err && err.message) ? err.message : String(err),
                        errors: (err && err.errors) || [], summary: null, groups: [] };
                    _srdBulkRender({ reveal: true });
                });
        // TWO ARGUMENTS, NOT .catch — a rejection handler passed here sees ONLY a failure of the
        // READ. A .catch would also swallow anything thrown while validating or rendering above and
        // report it to the operator as an unreadable file, which is a different fault with a
        // different fix.
        }, function (e) {
            b.preview = { changedRows: 0, rejected: true, groups: [], summary: null,
                errors: [{ line: 0, code: 'FILE_NOT_READABLE',
                    detail: (e && e.message) ? e.message : 'Could not read that file.' }] };
            _srdBulkRender({ reveal: true });
        });
    }

    function _srdPriceTxt(v) { return v === null || v === undefined ? '—' : String(v); }

    /**
     * §6 — THE HEADLINE. One sentence of arithmetic, in the order a person checks it: how much was in the
     * file, how much of it does something, how much does not, and whether anything is wrong.
     */
    function _srdBulkSummaryHtml(sum) {
        var b = _srdBulk;
        var bits = [];
        bits.push('<strong>' + sum.rowsChanging + '</strong> ' + (sum.rowsChanging === 1 ? 'row changes' : 'rows change'));
        bits.push(sum.rowsUnchanged + ' unchanged');
        bits.push('<span class="' + (sum.rowsRejected || sum.errorCount ? 'srd-bulk__bad' : '') + '">' +
            (sum.rowsRejected || sum.errorCount) + ' ' + ((sum.rowsRejected || sum.errorCount) === 1 ? 'error' : 'errors') + '</span>');
        return '<div class="srd-bulk__sum">' +
            '<div class="srd-bulk__sum-h">' + sum.rowsInFile + ' row' + (sum.rowsInFile === 1 ? '' : 's') + ' processed</div>' +
            '<div class="srd-bulk__sum-b">' + bits.join(' · ') + '</div>' +
            '<div class="srd-bulk__sum-m">' +
            '<span>File <strong>' + esc(b.fileName || '') + '</strong></span>' +
            '<span>Target <strong>' + esc(b.scope.country) + ' · ' + esc(b.scope.marketplace) + '</strong></span>' +
            '<span>Currency <strong>' + esc(b.scope.currency) + '</strong></span>' +
            '</div></div>';
    }

    /**
     * §8 — ONE CARD PER SKU, and only for SKUs that change.
     *
     * The old table put one ROW per changed field, so a SKU whose Regular, Minimum and MSRP all moved was
     * three unconnected lines sharing a code column — and the reader had to do the joining. A person reads
     * "what is happening to this product", not "what is happening to this field", so the SKU is the card
     * and the fields are its lines. Unchanged fields of a changing SKU are not drawn at all: they are not
     * news, and printing "unchanged" beside a price is how a summary becomes a table again.
     */
    function _srdBulkCardHtml(P, g) {
        var b = _srdBulk;
        var lines = g.changes.map(function (c) {
            var to = c.mode === 'AUTO' && c.new_value === null ? 'Auto' : _srdPriceTxt(c.new_value);
            return '<div class="srd-bulk__chg">' +
                '<span class="srd-bulk__chg-f">' + esc(c.label) + '</span>' +
                '<span class="srd-bulk__chg-v">' + esc(_srdPriceTxt(c.current_value)) +
                    ' <i>→</i> <strong>' + esc(to) + '</strong></span>' +
                '<span class="srd-bulk__chg-o">' +
                    '<span class="srd-own srd-own--' + c.current_owner.toLowerCase() + '">' + esc(P.ownerLabel(c.current_owner)) + '</span>' +
                    ' <i>→</i> ' +
                    '<span class="srd-own srd-own--' + c.new_owner.toLowerCase() + '">' + esc(P.ownerLabel(c.new_owner)) + '</span>' +
                '</span>' +
                '<span class="srd-bulk__chg-a">' + esc(P.actionLabel(c.mode)) + '</span>' +
                '</div>';
        }).join('');
        return '<div class="srd-bulk__card">' +
            '<div class="srd-bulk__card-h"><strong>' + esc(g.sku || g.marketplace_sku_id) + '</strong>' +
            '<span>' + esc(b.scope.country) + ' · ' + esc(b.scope.marketplace) + ' · ' + esc(b.scope.currency) +
            (g.site_sku ? ' · ' + esc(g.site_sku) : '') + '</span></div>' + lines + '</div>';
    }

    /**
     * §7/§10 — CHANGE-ORIENTED, AND BOUNDED. Only changing SKUs reach the list; the unchanged ones are a
     * number in the summary above it. A hundred-row file that changes one price renders one card.
     *
     * The cap is on what is BUILT, not on what is scrolled. Slicing the array before it becomes HTML is the
     * difference between a modal that stays responsive at 500 changes and one that pauses while the browser
     * lays out a table nobody asked to read.
     *
     * ERRORS ARE DRAWN FIRST AND ARE NEVER PAGED. A rejected file writes nothing at all, so its errors are
     * the whole message; and on a file that passed, an error is rarer than a change and must not be pushed
     * below twenty cards by a list that is merely long.
     */
    function _srdBulkPreviewHtml() {
        var P = _srdPricingApi(), b = _srdBulk;
        var pv = b && b.preview;
        if (!pv) return '<div class="srd-secnote">Choose a file, then <strong>Preview</strong>. Nothing is written until you confirm.</div>';

        if (pv.rejected) {
            return '<div class="srd-taxwarn">' +
                (pv.serverMessage
                    ? 'The database rejected the file. <strong>Nothing was written.</strong> ' + esc(pv.serverMessage)
                    : 'The file was rejected. <strong>Nothing was written.</strong>') +
                '</div>' + _srdBulkErrs(pv.errors || []);
        }

        var sum = pv.summary;
        var head = sum ? _srdBulkSummaryHtml(sum) : '';

        if (pv.noop) {
            return head + '<div class="srd-secnote">Every action in this file is <strong>' +
                esc(P.actionLabel('NO_CHANGE')) + '</strong>. Nothing to write.</div>';
        }
        if (!pv.groups.length) {
            return head + '<div class="srd-secnote">Every row already holds exactly what the file asks for. Nothing would change.</div>';
        }

        var size = P.PREVIEW_PAGE_SIZE;
        var shown = Math.min(pv.groups.length, Math.max(size, b.shown || size));
        var cards = pv.groups.slice(0, shown).map(function (g) { return _srdBulkCardHtml(P, g); }).join('');
        var shownChanges = pv.groups.slice(0, shown).reduce(function (n, g) { return n + g.changes.length; }, 0);
        var more = shown < pv.groups.length
            ? '<div class="srd-bulk__more"><span>Showing ' + shownChanges + ' of ' + sum.fieldChanges + ' changes (' +
              shown + ' of ' + pv.groups.length + ' SKUs)</span>' +
              '<button type="button" class="srd-btn srd-btn--default" onclick="srdBulkShowMore()">Show More</button></div>'
            : (pv.groups.length > size
                ? '<div class="srd-bulk__more"><span>Showing all ' + sum.fieldChanges + ' changes across ' + pv.groups.length + ' SKUs</span></div>'
                : '');

        return head + '<div class="srd-bulk__cards">' + cards + '</div>' + more +
            '<div class="srd-secnote">Nothing has been written yet.</div>';
    }

    /** §7 — one more page of cards. It re-renders an answer already held; the server is not asked again. */
    function srdBulkShowMore() {
        var P = _srdPricingApi(), b = _srdBulk;
        if (!P || !b || !b.preview) return;
        b.shown = Math.max(P.PREVIEW_PAGE_SIZE, b.shown || P.PREVIEW_PAGE_SIZE) + P.PREVIEW_PAGE_SIZE;
        _srdBulkRender();
    }

    function srdBulkToConfirm() {
        var b = _srdBulk; if (!b || !b.preview || !b.preview.changedRows) return;
        b.stage = 'confirm'; _srdBulkRender();
    }
    function srdBulkBackToPreview() {
        var b = _srdBulk; if (!b) return;
        b.stage = 'scope'; _srdBulkRender();
    }

    /** CONFIRM. Writes exactly the lines the preview validated — never the file re-read a second time. */

    // =====================================================================================================
    // S3-R10 §9 — WHAT A FAILED WRITE IS ALLOWED TO SAY.
    //
    // "Nothing was written." is a claim about the DATABASE. Before this round every post-dispatch failure
    // made it, including the one that mattered: production showed "Write refused. Nothing was written. API
    // returned 404" for a bulk update whose rows had committed. The 404 came from an expired Apps Script
    // redirect target — it described the browser's journey, not the server's work.
    //
    // The rule is simple and it is about who knows what:
    //   CONFIRMED_REJECTED   the SERVER said no. It validates every line before touching a cell, so this
    //                        really is a zero-write, and saying so is correct.
    //   OUTCOME_UNKNOWN      we did not get an answer. The write may be committed. We say we do not know,
    //                        and — critically — we tell the operator not to submit it again, because a
    //                        second submission is the one action that can turn this into real damage.
    // =====================================================================================================
    function _srdWriteFailureHtml_(err) {
        var msg = esc(err && err.message ? err.message : String(err));
        if (err && err.write_outcome === 'OUTCOME_UNKNOWN') {
            return '<div class="srd-taxwarn">' +
                '<strong>We couldn\u2019t confirm the result yet.</strong> ' +
                'Do not submit this update again while the system checks whether it was committed. ' +
                msg +
                (err.write_id ? ' <span class="srd-dim">Reference: ' + esc(err.write_id) + '</span>' : '') +
                '</div>';
        }
        return '<div class="srd-taxwarn">Update was rejected. <strong>Nothing was written.</strong> ' + msg + '</div>';
    }

    function srdBulkConfirm() {
        var P = _srdPricingApi(), b = _srdBulk; if (!P || !b || !b.lines || !b.lines.length) return;
        var btn = el('srd-bulk-confirm-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Writing…'; }
        window.KM.DB.updatePricing({ changed_by: 'sku-regional-details',
            change_reason: 'Bulk pricing update ' + b.scope.country + '/' + b.scope.marketplace,
            lines: b.lines })
            .then(function (rec) {
                b.result = { summary: P.resultSummary(rec.rows), logged: rec.logged || 0, rows: rec.rows || [] };
                b.stage = 'result';
                _srdBulkRender();
                _srdAfterWrite(function () { render(); });
            })
            .catch(function (err) {
                if (btn) { btn.disabled = false; btn.textContent = 'Confirm Update'; }
                var modal = el('srd-bulk-modal');
                if (modal) {
                    var body = modal.querySelector('.srd-modal__body');
                    if (body) body.innerHTML = _srdWriteFailureHtml_(err) + _srdBulkErrs((err && err.errors) || []);
                }
            });
    }

    function srdBulkDownloadResult() {
        var P = _srdPricingApi(), b = _srdBulk; if (!P || !b || !b.result) return;
        var cols = ['marketplace_sku_id', 'sku', 'site_sku', 'field', 'mode', 'current_value', 'new_value',
            'current_owner', 'new_owner'];
        var rows = (b.previewRows || []).map(function (c) {
            return cols.map(function (k) { return c[k] === null || c[k] === undefined ? '' : c[k]; });
        });
        var csv = [cols.join(',')].concat(rows.map(function (r) {
            return r.map(function (v) { var x = String(v); return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',');
        })).join('\r\n');
        _srdDownload('pricing-update-result-' + b.scope.country + '-' + b.scope.marketplace + '.csv', csv);
    }

    window.srdOpenEdit = srdOpenEdit;
    window.srdAddForCountry = srdAddForCountry;
    window.srdCloseEdit = srdCloseEdit;
    window.srdSaveEdit = srdSaveEdit;
    window.srdOpenMasterDrawer = srdOpenMasterDrawer;
    window.srdCloseDrawer = srdCloseDrawer;
    window.srdEditMaster = srdEditMaster;
    window.srdOpenTaxEditor = srdOpenTaxEditor;
    window.srdSetCountry = srdSetCountry;
    window.srdSetRecord = srdSetRecord;
    window.srdSetTab = srdSetTab;
    window.srdPage = srdPage;
    window.srdPageSize = srdPageSize;
    window.srdBackToResults = srdBackToResults;
    window.srdPriceModeChanged = srdPriceModeChanged;
    window.srdOpenBulkUpdate = srdOpenBulkUpdate;
    window.srdBulkShowMore = srdBulkShowMore;
    window.srdCloseBulkUpdate = srdCloseBulkUpdate;
    window.srdBulkPickCategory = srdBulkPickCategory;
    window.srdBulkSetCountry = srdBulkSetCountry;
    window.srdBulkSetMarketplace = srdBulkSetMarketplace;
    window.srdBulkDownloadCurrent = srdBulkDownloadCurrent;
    window.srdBulkDownloadTemplate = srdBulkDownloadTemplate;
    window.srdBulkDownloadTemplateCsv = srdBulkDownloadTemplateCsv;
    window.srdBulkPreview = srdBulkPreview;
    window.srdBulkToConfirm = srdBulkToConfirm;
    window.srdBulkBackToPreview = srdBulkBackToPreview;
    window.srdBulkConfirm = srdBulkConfirm;
    window.srdBulkDownloadResult = srdBulkDownloadResult;
    window.srdOpenPriceImport = srdOpenPriceImport;
    window.srdClosePriceImport = srdClosePriceImport;
    window.srdDownloadPriceTemplate = srdDownloadPriceTemplate;
    window.srdDownloadCurrentPricing = srdDownloadCurrentPricing;
    window.srdPreviewPriceImport = srdPreviewPriceImport;
    window.srdConfirmPriceImport = srdConfirmPriceImport;
    window.srdRetry = srdRetry;
    window.srdRender = render;
    window.srdInvalidate = _srdInvalidate_;   // F1-7M-B2-HOTFIX: external same-session invalidation hook (see _srdInvalidate_)
    window.initSkuRegionalDetailsPage = loadAndInit;

    function ensureMarkup() {
        if (el('sku-regional-details-section')) return Promise.resolve(true);
        if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
            return window.KM.partialLoader
                .loadPartial('sku-regional-details', 'assets/html/pages/sku-regional-details.html', '#sku-regional-details-mount')
                .then(function () { return true; })
                .catch(function (err) { console.warn('[SkuRegionalDetails] partial load failed:', err); return false; });
        }
        return Promise.resolve(false);
    }

    if (window.KM && window.KM.lifecycle) {
        KM.lifecycle.register('sku-regional-details-section', {
            mount: function () {
                ensureMarkup().then(function () {
                    var sec = el('sku-regional-details-section');
                    if (sec) sec.classList.add('active');
                    loadAndInit();
                });
            },
            unmount: function () { srdCloseEdit(); srdCloseDrawer(); }
        });
    }
})();
