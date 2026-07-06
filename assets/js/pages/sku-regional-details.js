// ========================================
// SKU Regional Details (SKU Domain v2.0 Layer 2 — sku_regional_details)
// Simple management UI: view + edit regional identity / compliance-document fields.
// Editing site_sku / marketplace_product_id syncs to marketplace_skus (Regional = higher priority).
// NO pricing, NO tax/duty/HS-code (those live in tax_referral_rates). NO calculation.
// ========================================

(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function useDb() {
        return !!(window.KM && window.KM.DB && window.KM.DB.getDataSourceMode &&
            window.KM.DB.getDataSourceMode() === 'google-sheet' && window.KM.DB.getSkuRegionalDetails);
    }
    var srdEditKey = null;   // { sku, company, country, marketplace } of the row being edited

    function loadAndInit() {
        var note = document.getElementById('srd-mode-note');
        if (!document.getElementById('sku-regional-details-section')) return;
        if (!useDb()) {
            if (note) note.innerHTML = '<span class="srd-note--demo">Connect the Operation DB (Google Sheet) to manage SKU Regional Details. No live data in demo mode.</span>';
            _srdEmpty('SKU Regional Details are stored in the Operation DB. Enable the cloud DB to use this page.');
            return;
        }
        if (note) note.innerHTML = '';
        if (!window._opDbCache && window.KM.DB.loadOperationDb) {
            window.KM.DB.loadOperationDb({ force: true }).then(render).catch(render);
        } else {
            render();
        }
    }

    function _srdEmpty(msg) {
        var wrap = document.getElementById('srd-table-wrap');
        if (wrap) wrap.innerHTML = '<div class="srd-empty">' + msg + '</div>';
        var meta = document.getElementById('srd-result-meta');
        if (meta) meta.textContent = '';
    }

    function _rows() {
        return (window.KM.DB.getSkuRegionalDetails && window.KM.DB.getSkuRegionalDetails()) || [];
    }

    function render() {
        var wrap = document.getElementById('srd-table-wrap');
        if (!wrap) return;
        if (!useDb()) { _srdEmpty('Enable the cloud DB to view SKU Regional Details.'); return; }

        var kw = (document.getElementById('srd-search') || {}).value || '';
        kw = kw.trim().toLowerCase();
        var rows = _rows().filter(function (r) {
            if (!kw) return true;
            return String(r.sku || '').toLowerCase().indexOf(kw) !== -1 ||
                   String(r.siteSku || '').toLowerCase().indexOf(kw) !== -1 ||
                   String(r.marketplaceProductId || '').toLowerCase().indexOf(kw) !== -1;
        });

        var meta = document.getElementById('srd-result-meta');
        if (meta) meta.textContent = rows.length + ' regional row(s)';

        if (!rows.length) { wrap.innerHTML = '<div class="srd-empty">No SKU Regional Details rows' + (kw ? ' match the search.' : ' yet. They are created when a Marketplace SKU is added.') + '</div>'; return; }

        var body = rows.map(function (r) {
            var key = [r.sku, r.company, r.country, r.marketplace].join('|');
            return '<tr>' +
                '<td>' + esc(r.sku) + '</td>' +
                '<td>' + esc(r.company) + '</td>' +
                '<td>' + esc(r.country) + '</td>' +
                '<td>' + esc(r.marketplace) + '</td>' +
                '<td>' + esc(r.siteSku) + '</td>' +
                '<td>' + esc(r.marketplaceProductId) + '</td>' +
                '<td>' + esc(r.packagingRegulation) + '</td>' +
                '<td>' + (r.regulationUrl ? '<a href="' + esc(r.regulationUrl) + '" target="_blank" rel="noopener">link</a>' : '') + '</td>' +
                '<td>' + esc(r.language) + '</td>' +
                '<td>' + esc(r.manualVersion) + '</td>' +
                '<td>' + esc(r.labelVersion) + '</td>' +
                '<td>' + esc(r.batteryRegulation) + '</td>' +
                '<td><button class="srd-btn srd-btn--sm" onclick="srdEdit(\'' + esc(key).replace(/'/g, "\\'") + '\')">Edit</button></td>' +
            '</tr>';
        }).join('');

        wrap.innerHTML =
            '<table class="srd-table"><thead><tr>' +
                '<th>SKU</th><th>Company</th><th>Country</th><th>Marketplace</th><th>Site SKU</th><th>Marketplace Product ID</th>' +
                '<th>Packaging Reg.</th><th>Reg. URL</th><th>Language</th><th>Manual Ver.</th><th>Label Ver.</th><th>Battery Reg.</th><th></th>' +
            '</tr></thead><tbody>' + body + '</tbody></table>';
    }

    function _find(key) {
        var parts = String(key).split('|');
        return _rows().filter(function (r) {
            return String(r.sku) === (parts[0] || '') && String(r.company) === (parts[1] || '') &&
                   String(r.country) === (parts[2] || '') && String(r.marketplace) === (parts[3] || '');
        })[0] || null;
    }

    function edit(key) {
        var r = _find(key);
        if (!r) { alert('Row not found.'); return; }
        srdEditKey = { sku: r.sku, company: r.company, country: r.country, marketplace: r.marketplace };
        var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
        set('srd-f-sku', r.sku); set('srd-f-company', r.company); set('srd-f-country', r.country); set('srd-f-marketplace', r.marketplace);
        set('srd-f-site_sku', r.siteSku); set('srd-f-marketplace_product_id', r.marketplaceProductId);
        set('srd-f-packaging_regulation', r.packagingRegulation); set('srd-f-regulation_url', r.regulationUrl);
        set('srd-f-language', r.language); set('srd-f-manual_version', r.manualVersion);
        set('srd-f-label_version', r.labelVersion); set('srd-f-battery_regulation', r.batteryRegulation);
        document.getElementById('srd-modal-overlay').style.display = 'block';
        document.getElementById('srd-modal').style.display = 'block';
    }
    function closeModal() {
        srdEditKey = null;
        var o = document.getElementById('srd-modal-overlay'), m = document.getElementById('srd-modal');
        if (o) o.style.display = 'none';
        if (m) m.style.display = 'none';
    }
    function save() {
        if (!srdEditKey) return;
        if (!useDb() || !window.KM.DB.upsertSkuRegionalDetail) { alert('Enable the cloud DB to save.'); return; }
        var get = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
        var payload = {
            sku: srdEditKey.sku, company: srdEditKey.company, country: srdEditKey.country, marketplace: srdEditKey.marketplace,
            site_sku: get('srd-f-site_sku'),
            marketplace_product_id: get('srd-f-marketplace_product_id'),
            packaging_regulation: get('srd-f-packaging_regulation'),
            regulation_url: get('srd-f-regulation_url'),
            language: get('srd-f-language'),
            manual_version: get('srd-f-manual_version'),
            label_version: get('srd-f-label_version'),
            battery_regulation: get('srd-f-battery_regulation'),
            // Regional = higher-priority source → propagate identity into marketplace_skus.
            sync_marketplace_sku: true
        };
        window.KM.DB.upsertSkuRegionalDetail(payload).then(function (data) {
            closeModal();
            render();
            alert('Saved.' + (data && data.synced ? ' marketplace_skus identity synced.' : ''));
        }).catch(function (e) { alert('Save failed: ' + (e && e.message ? e.message : e)); });
    }

    function ensureMarkup() {
        if (document.getElementById('sku-regional-details-section')) return Promise.resolve(true);
        if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
            return window.KM.partialLoader
                .loadPartial('sku-regional-details', 'assets/html/pages/sku-regional-details.html', '#sku-regional-details-mount')
                .then(function () { return true; })
                .catch(function (err) { console.warn('[SkuRegionalDetails] partial load failed:', err); return false; });
        }
        return Promise.resolve(false);
    }

    window.srdRender = render;
    window.srdEdit = edit;
    window.srdCloseModal = closeModal;
    window.srdSave = save;
    window.initSkuRegionalDetailsPage = loadAndInit;

    if (window.KM && window.KM.lifecycle) {
        KM.lifecycle.register('sku-regional-details-section', {
            mount: function () {
                ensureMarkup().then(function () {
                    var sec = document.getElementById('sku-regional-details-section');
                    if (sec) sec.classList.add('active');
                    loadAndInit();
                });
            },
            unmount: function () { closeModal(); }
        });
    }
})();
