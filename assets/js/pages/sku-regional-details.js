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
        return Promise.resolve(window.KM.api.getWorkspace('skuDetails', { include: { regional: true } })).then(function (env) {
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
                (st.kind === 'ambiguous' ? '<div class="srd-taxwarn">Multiple marketplace_skus rows match this identity — operational status is ambiguous and not shown. Resolve the duplicate linkage.</div>' : '') + editBtn;
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
        modal.innerHTML =
            '<div class="srd-modal__head"><span>' + (isAdd ? 'Add Regional Detail' : 'Edit Regional Detail — ' + esc(r.sku)) + '</span><button type="button" class="srd-x" aria-label="Close" onclick="srdCloseEdit()">×</button></div>' +
            '<div class="srd-modal__body">' + identity + fields +
                '<p class="srd-modal__hint">Editing <strong>Site SKU</strong> / <strong>Marketplace Product ID</strong> also syncs the matching <code>marketplace_skus</code> row (Regional = higher-priority source). No pricing / tax / Master fields are written here.</p>' +
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
            srdCloseEdit();
            srdState.selectedSku = sku;
            srdState.activeCountry = up(country);
            srdState.activeRecordKey = data && data.regional_detail_id ? data.regional_detail_id : (lc(sku) + '||' + lc(company) + '||' + lc(country) + '||' + lc(marketplace));
            // F1-7J-A: scoped post-write reconcile (Workspace → re-read skuDetails include.regional then render; Legacy →
            // render immediately, the writer already reloaded the broad cache). No page-level broad Operation DB reload.
            _srdAfterWrite(function () { render(); });
            srdToast('Saved.' + (data && data.synced ? ' marketplace_skus identity synced.' : (data && data.synced === false ? ' (No matching marketplace_skus row to sync.)' : '')));
        }).catch(function (err) {
            _srdSaving = false;
            var b = el('srd-save-btn'); if (b) { b.disabled = false; b.textContent = isAdd ? 'Create' : 'Review Changes & Save'; }
            srdToast('Save failed: ' + (err && err.message ? err.message : err));
        });
    }
    function findByKey(key) { var rows = _rows(); for (var i = 0; i < rows.length; i++) if (rowKey(rows[i]) === key) return rows[i]; return null; }

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
