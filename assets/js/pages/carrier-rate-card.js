// ========================================
// Carrier Rate Card (Carrier & Route Spec v1.4 §4C)
// Reference / Master-like logistics pricing data — NOT a Decision Layer.
// - Live read: carriers / carrier_rate_cards / carrier_lead_times via KM.DB.*
// - Lead Time is DISPLAY-ONLY, joined from carrier_lead_times (single source of truth); blank if none.
// - carrier_rate_cards NEVER stores Lead Time / transit_days.
// - Template Export (client-side CSV, no Lead Time) + Template Import (append-only, validated).
// NO pricing engine, NO carrier ranking, NO automatic carrier decision.
// ========================================

(function () {
    'use strict';

    // ---- helpers ----
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function up(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
    function low(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
    // Display a numeric-or-blank rate-card field.
    function numDisp(v) { return (v === '' || v == null) ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 }); }
    function dash(v) { var s = String(v == null ? '' : v).trim(); return s ? esc(s) : ''; }

    function useDb() {
        return !!(window.KM && window.KM.DB && window.KM.DB.getDataSourceMode &&
            window.KM.DB.getDataSourceMode() === 'google-sheet' && window.KM.DB.getCarrierRateCards);
    }

    // Last search result (normalized rate-card rows) — source for Template Export.
    var crcCurrentRows = [];
    var crcSearched = false;

    // ---- load + init ----
    function loadAndInit() {
        var note = document.getElementById('crc-mode-note');
        if (!document.getElementById('carrier-rate-card-section')) return;

        if (!useDb()) {
            if (note) note.innerHTML = '<span class="crc-note--demo">Connect the Operation DB (Google Sheet) to view / import Carrier Rate Cards. No live data is shown in demo mode.</span>';
            _crcResetTable('Carrier Rate Cards are stored in the Operation DB. Enable the cloud DB to use this page.');
            return;
        }
        if (note) note.innerHTML = '';

        if (!window._opDbCache && window.KM.DB.loadOperationDb) {
            window.KM.DB.loadOperationDb({ force: true }).then(_crcInit).catch(_crcInit);
        } else {
            _crcInit();
        }
    }

    function _crcInit() {
        _crcPopulateFilters();
        // No data shown before Search.
        if (!crcSearched) _crcResetTable('Set filters and click <strong>Search</strong> to view carrier rate cards.');
    }

    // Populate Method + Carrier dropdowns from live data (distinct). Table stays empty until Search.
    function _crcPopulateFilters() {
        var cards = (window.KM.DB.getCarrierRateCards && window.KM.DB.getCarrierRateCards()) || [];
        var carriers = (window.KM.DB.getCarriers && window.KM.DB.getCarriers()) || [];

        var methodSel = document.getElementById('crcFilterMethod');
        if (methodSel) {
            var methods = {}, mList = [];
            cards.forEach(function (c) { var m = String(c.shippingMethod || '').trim(); if (m && !methods[m]) { methods[m] = 1; mList.push(m); } });
            mList.sort();
            methodSel.innerHTML = '<option value="">All</option>' + mList.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
        }

        var mileSel = document.getElementById('crcFilterLastMile');
        if (mileSel) {
            var miles = {}, mileList = [];
            cards.forEach(function (c) { var lm = String(c.lastMileDelivery || '').trim(); if (lm && !miles[lm]) { miles[lm] = 1; mileList.push(lm); } });
            mileList.sort();
            mileSel.innerHTML = '<option value="">All</option>' + mileList.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
        }

        var carrierSel = document.getElementById('crcFilterCarrier');
        if (carrierSel) {
            // Prefer the carriers master; fall back to distinct carrier_id present on rate cards.
            var opts = [];
            if (carriers.length) {
                carriers.forEach(function (c) { if (c.carrierId) opts.push({ id: c.carrierId, label: c.carrierName || c.carrierId }); });
            } else {
                var seen = {};
                cards.forEach(function (c) { if (c.carrierId && !seen[c.carrierId]) { seen[c.carrierId] = 1; opts.push({ id: c.carrierId, label: c.carrierId }); } });
            }
            opts.sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); });
            carrierSel.innerHTML = '<option value="">All</option>' + opts.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.label) + '</option>'; }).join('');
        }
    }

    function _crcResetTable(msg) {
        var wrap = document.getElementById('crc-table-wrap');
        if (wrap) wrap.innerHTML = '<div class="crc-empty" id="crc-empty">' + msg + '</div>';
        var meta = document.getElementById('crc-result-meta');
        if (meta) meta.textContent = '';
    }

    // ---- Lead Time join (carrier_lead_times = single source of truth; blank if no match) ----
    // Join key = carrier_id + origin_country + destination_country + shipping_method + last_mile_delivery.
    // Legacy fallback (blank last_mile_delivery) = the same key WITHOUT last_mile_delivery.
    function _crcLtKey(o, method, lastMile) { return o + '|' + low(method) + '|' + low(lastMile); }
    function _crcLtBase(carrierId, origin, dest) { return up(carrierId) + '|' + up(origin) + '|' + up(dest); }
    function _crcLeadTimeMap() {
        var full = {}, legacy = {};
        var rows = (window.KM.DB.getCarrierLeadTimes && window.KM.DB.getCarrierLeadTimes()) || [];
        rows.forEach(function (lt) {
            var base = _crcLtBase(lt.carrierId, lt.originCountry, lt.destinationCountry);
            var fullKey = _crcLtKey(base, lt.shippingMethod, lt.lastMileDelivery);
            if (!full[fullKey]) full[fullKey] = lt;   // first wins
            // Legacy index (method only) for fallback when a rate card has no last_mile_delivery.
            var legacyKey = _crcLtKey(base, lt.shippingMethod, '');
            if (!legacy[legacyKey]) legacy[legacyKey] = lt;
        });
        return { full: full, legacy: legacy };
    }
    function _crcLeadTimeDisplay(card, ltMap) {
        var base = _crcLtBase(card.carrierId, card.originCountry, card.destinationCountry);
        var lt = null;
        var mile = String(card.lastMileDelivery || '').trim();
        if (mile) lt = ltMap.full[_crcLtKey(base, card.shippingMethod, mile)];
        // Fallback: card has no last_mile_delivery (or no exact match) → legacy key (method only).
        if (!lt) lt = ltMap.legacy[_crcLtKey(base, card.shippingMethod, '')];
        if (!lt) return '';   // NO fabricated fallback value
        var hasMin = lt.minDays !== '' && lt.minDays != null;
        var hasMax = lt.maxDays !== '' && lt.maxDays != null;
        if (hasMin && hasMax) return lt.minDays + ' ~ ' + lt.maxDays + ' days';
        var hasAvg = lt.avgDays !== '' && lt.avgDays != null;
        if (hasAvg) return lt.avgDays + ' days avg';
        if (hasMin) return lt.minDays + ' days';
        if (hasMax) return lt.maxDays + ' days';
        return '';
    }

    // ---- Search ----
    function search() {
        if (!useDb()) { _crcResetTable('Enable the cloud DB to search Carrier Rate Cards.'); return; }
        crcSearched = true;

        var fDate = (document.getElementById('crcFilterDate') || {}).value || '';
        var fCountry = up((document.getElementById('crcFilterCountry') || {}).value || '');
        var fMethod = (document.getElementById('crcFilterMethod') || {}).value || '';
        var fLastMile = (document.getElementById('crcFilterLastMile') || {}).value || '';
        var fCarrier = (document.getElementById('crcFilterCarrier') || {}).value || '';

        var cards = (window.KM.DB.getCarrierRateCards && window.KM.DB.getCarrierRateCards()) || [];
        var carriers = (window.KM.DB.getCarriers && window.KM.DB.getCarriers()) || [];
        var nameById = {};
        carriers.forEach(function (c) { if (c.carrierId) nameById[c.carrierId] = c.carrierName || c.carrierId; });

        var filtered = cards.filter(function (c) {
            // Date within [effective_from, effective_to] (blank effective_to = open-ended).
            if (fDate) {
                if (c.effectiveFrom && fDate < c.effectiveFrom) return false;
                if (c.effectiveTo && fDate > c.effectiveTo) return false;
            }
            if (fCountry && up(c.destinationCountry).indexOf(fCountry) === -1) return false;
            if (fMethod && String(c.shippingMethod || '') !== fMethod) return false;
            if (fLastMile && String(c.lastMileDelivery || '') !== fLastMile) return false;
            if (fCarrier && String(c.carrierId || '') !== fCarrier) return false;
            return true;
        });

        crcCurrentRows = filtered;
        _crcRender(filtered, nameById);
    }

    function _crcRender(rows, nameById) {
        var wrap = document.getElementById('crc-table-wrap');
        var meta = document.getElementById('crc-result-meta');
        if (!wrap) return;
        if (meta) meta.textContent = rows.length + ' rate row(s)';

        if (!rows.length) {
            wrap.innerHTML = '<div class="crc-empty">No carrier rate cards match the current filters.</div>';
            return;
        }

        var ltMap = _crcLeadTimeMap();
        function shipTo(c) {
            return c.destinationWarehouseCode || c.destinationCity || c.destinationCountry || '';
        }
        function shipFrom(c) {
            return [c.originCountry, c.originCity].filter(function (x) { return String(x || '').trim(); }).join(' / ');
        }
        function effDate(c) {
            var a = c.effectiveFrom || '', b = c.effectiveTo || '';
            if (!a && !b) return '';
            return esc(a) + ' ~ ' + (b ? esc(b) : '—');
        }

        var body = rows.map(function (c) {
            return '<tr>' +
                '<td>' + esc(nameById[c.carrierId] || c.carrierId || '') + '</td>' +
                '<td>' + esc(shipFrom(c)) + '</td>' +
                '<td>' + esc(shipTo(c)) + '</td>' +
                '<td>' + dash(c.shippingMethod) + '</td>' +
                '<td>' + dash(c.lastMileDelivery) + '</td>' +
                '<td>' + esc(_crcLeadTimeDisplay(c, ltMap)) + '</td>' +
                '<td>' + dash(c.chargeType) + '</td>' +
                '<td>' + dash(c.chargeUnit) + '</td>' +
                '<td class="crc-num">' + numDisp(c.minBoxWeight) + '</td>' +
                '<td>' + dash(c.minBoxWeightUnit) + '</td>' +
                '<td class="crc-num">' + numDisp(c.weightTier) + '</td>' +
                '<td>' + dash(c.weightTierUnit) + '</td>' +
                '<td class="crc-num">' + numDisp(c.unitRate) + '</td>' +
                '<td class="crc-num">' + numDisp(c.minCharge) + '</td>' +
                '<td class="crc-num">' + numDisp(c.fuelSurcharge) + '</td>' +
                '<td class="crc-num">' + numDisp(c.customsFee) + '</td>' +
                '<td class="crc-num">' + numDisp(c.docFee) + '</td>' +
                '<td>' + dash(c.transitType) + '</td>' +
                '<td>' + dash(c.batteryType) + '</td>' +
                '<td>' + dash(c.customsType) + '</td>' +
                '<td>' + effDate(c) + '</td>' +
                '<td>' + dash(c.status) + '</td>' +
                '<td>' + dash(c.currency) + '</td>' +
                '<td>' + dash(c.note) + '</td>' +
            '</tr>';
        }).join('');

        wrap.innerHTML =
            '<table class="crc-table">' +
                '<thead><tr>' +
                    '<th>Carrier</th><th>Ship From</th><th>Ship To</th><th>Shipping Method</th><th>Last Mile Delivery</th><th>Lead Time</th>' +
                    '<th>Charge Type</th><th>Charge Unit</th><th class="crc-num">Min Box Weight</th><th>Min Box Weight Unit</th>' +
                    '<th class="crc-num">Weight Tier</th><th>Weight Tier Unit</th><th class="crc-num">Unit Rate</th>' +
                    '<th class="crc-num">Min Charge</th><th class="crc-num">Fuel Surcharge</th><th class="crc-num">Customs Fee</th>' +
                    '<th class="crc-num">Doc Fee</th><th>Transit Type</th><th>Battery Type</th><th>Customs Type</th>' +
                    '<th>Effective Date</th><th>Status</th><th>Currency</th><th>Note</th>' +
                '</tr></thead><tbody>' + body + '</tbody>' +
            '</table>';
    }

    // ---- Template Export (client-side; no Lead Time / transit_days) ----
    // Update Template — routine carrier quotation update, CARRIER-SCOPED. Requires a selected carrier and
    // exports ONLY that carrier's existing ACTIVE rows (each carries rate_card_id). unit_rate /
    // effective_from / effective_to are cleared for the carrier to re-fill; route/method locked (importer-enforced).
    // The carrier may add new route/method rows in the blank rows below (blank rate_card_id → created on import).
    function exportUpdateTemplate() {
        if (!useDb()) { alert('Enable the cloud DB first.'); return; }
        var fCarrier = (document.getElementById('crcFilterCarrier') || {}).value || '';
        if (!fCarrier) { alert('Please select a carrier before exporting Update Template.'); return; }

        var carriers = (window.KM.DB.getCarriers && window.KM.DB.getCarriers()) || [];
        var nameById = {};
        carriers.forEach(function (c) { if (c.carrierId) nameById[c.carrierId] = c.carrierName || c.carrierId; });
        var carrierName = nameById[fCarrier] || fCarrier;

        // Scope: that carrier's ACTIVE rows only (independent of the date/country filters, so the carrier
        // receives their full current rate set).
        var all = (window.KM.DB.getCarrierRateCards && window.KM.DB.getCarrierRateCards()) || [];
        var scoped = all.filter(function (c) {
            return String(c.carrierId || '') === fCarrier && String(c.status || 'active').toLowerCase() !== 'inactive';
        });
        if (!scoped.length) {
            if (!confirm('No active rate rows for ' + carrierName + '. Export an Update Template with only the example row (the carrier can add new routes)?')) return;
        }
        try {
            var res = window.KM.DB.exportCarrierRateTemplate(scoped, {
                mode: 'update',
                filename: 'carrier_rate_update_' + safeFile(carrierName) + '_' + new Date().toISOString().slice(0, 10) + '.csv'
            });
            console.log('[CarrierRateCard] exported update template (carrier=' + fCarrier + '):', res);
        } catch (e) {
            alert('Export failed: ' + (e && e.message ? e.message : e));
        }
    }
    // Filename-safe fragment.
    function safeFile(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'carrier'; }

    // Master Template — one-time full import / new-route setup. Exports ALL loaded rate cards with every
    // field editable (values kept, nothing cleared) so the user can add new carrier / shipping_method /
    // last_mile_delivery / warehouse / city / zip / country rows. Does not require a prior Search.
    function exportMasterTemplate() {
        if (!useDb()) { alert('Enable the cloud DB first.'); return; }
        var all = (window.KM.DB.getCarrierRateCards && window.KM.DB.getCarrierRateCards()) || [];
        if (!all.length) {
            if (!confirm('No carrier rate cards loaded. Export a Master Template with only the example row (set up new routes from scratch)?')) return;
        }
        try {
            var res = window.KM.DB.exportCarrierRateTemplate(all, { mode: 'master' });
            console.log('[CarrierRateCard] exported master template:', res);
        } catch (e) {
            alert('Export failed: ' + (e && e.message ? e.message : e));
        }
    }

    // ---- Template Import (append-only; validated server-side) ----
    var CRC_FORBIDDEN_COLS = ['transit_days', 'min_days', 'max_days', 'avg_days', 'lead_time_id'];

    function openImport() {
        if (!useDb()) { alert('Enable the cloud DB to import Carrier Rate Templates.'); return; }
        var input = document.getElementById('crcImportFile');
        if (input) { input.value = ''; input.click(); }
    }

    function importTemplate(input) {
        if (!input || !input.files || !input.files[0]) return;
        var file = input.files[0];
        var reader = new FileReader();
        reader.onload = function (e) {
            var parsed;
            try { parsed = _crcParseCsv(String(e.target.result || '')); }
            catch (err) { alert('Could not parse the file: ' + (err && err.message ? err.message : err)); return; }
            if (!parsed.columns.length) { alert('The file has no header row.'); return; }

            // Client pre-check: Lead Time / transit_days columns are NOT allowed in a Rate Template.
            var bad = parsed.columns.filter(function (c) { return CRC_FORBIDDEN_COLS.indexOf(low(c)) !== -1; });
            if (bad.length) {
                alert('Import blocked — these columns are not allowed in a Carrier Rate Template:\n\n' + bad.join(', ') +
                    '\n\nLead Time (min_days / max_days / avg_days) and transit_days are maintained separately in carrier_lead_times, not on rate cards.');
                return;
            }
            if (!parsed.rows.length) { alert('The file has no data rows.'); return; }

            // Mode from filename: a Master template import may update ANY field on existing rows; an Update
            // template import enforces locked route/method fields (default when the name is ambiguous).
            var mode = /master/i.test(file.name) ? 'master' : 'update';
            // Optional carrier scope for new rows with a blank carrier_id (from the selected carrier filter).
            var payload = { rows: parsed.rows, columns: parsed.columns, source_file_name: file.name, mode: mode };
            var fCarrier = (document.getElementById('crcFilterCarrier') || {}).value || '';
            if (fCarrier) payload.carrier_scope = { carrier_id: fCarrier };

            window.KM.DB.importCarrierRateTemplate(payload)
                .then(function (data) {
                    _crcShowImportResult(data, mode);
                    if (crcSearched) search();   // refresh the result after import
                })
                .catch(function (err) { alert('Import failed: ' + (err && err.message ? err.message : err)); });
        };
        reader.onerror = function () { alert('Could not read the file.'); };
        reader.readAsText(file);
    }

    function _crcShowImportResult(data, mode) {
        data = data || {};
        var errs = data.errors || [];
        var warns = data.warnings || [];
        var lines = [];
        lines.push('Import complete (' + (data.mode || mode || 'update') + ' template).');
        lines.push('Updated existing rows: ' + (data.updated_existing_count || 0));
        lines.push('Created new rows: ' + (data.created_new_count || 0));
        lines.push('Blank rows skipped: ' + (data.blank_skipped_count || 0));
        lines.push('Locked-field edits ignored: ' + (data.locked_fields_ignored_count || 0));
        lines.push('Rejected: ' + (data.rejected_count != null ? data.rejected_count : (data.rejected || 0)));
        if (data.skipped_examples) lines.push('Example rows skipped: ' + data.skipped_examples);
        if (data.batch_id) lines.push('Batch: ' + data.batch_id);
        if (warns.length) {
            lines.push('');
            lines.push('Warnings (locked fields kept at DB value):');
            warns.slice(0, 30).forEach(function (w) { lines.push('  Row ' + w.row + (w.rate_card_id ? ' [' + w.rate_card_id + ']' : '') + ': ' + w.message); });
            if (warns.length > 30) lines.push('  … +' + (warns.length - 30) + ' more');
        }
        if (errs.length) {
            lines.push('');
            lines.push('Row errors:');
            errs.slice(0, 30).forEach(function (er) { lines.push('  Row ' + er.row + ': ' + er.message); });
            if (errs.length > 30) lines.push('  … +' + (errs.length - 30) + ' more');
        }
        alert(lines.join('\n'));
    }

    // Minimal RFC-4180-ish CSV parser (handles quotes, commas, CRLF, quoted newlines).
    // Returns { columns:[...], rows:[{col:val,..., __row:<1-based sheet row>}] }.
    function _crcParseCsv(text) {
        text = text.replace(/^﻿/, '');   // strip BOM
        var records = [], field = '', row = [], inQ = false;
        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            if (inQ) {
                if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; } }
                else { field += ch; }
            } else {
                if (ch === '"') { inQ = true; }
                else if (ch === ',') { row.push(field); field = ''; }
                else if (ch === '\r') { /* skip */ }
                else if (ch === '\n') { row.push(field); records.push(row); row = []; field = ''; }
                else { field += ch; }
            }
        }
        if (field !== '' || row.length) { row.push(field); records.push(row); }
        // Drop fully-empty trailing records.
        records = records.filter(function (rec) { return rec.some(function (c) { return String(c).trim() !== ''; }); });
        if (!records.length) return { columns: [], rows: [] };
        var columns = records[0].map(function (h) { return String(h).trim(); });
        var rows = [];
        for (var r = 1; r < records.length; r++) {
            var obj = {};
            for (var c = 0; c < columns.length; c++) { obj[columns[c]] = records[r][c] != null ? String(records[r][c]).trim() : ''; }
            obj.__row = r + 1;   // 1-based sheet row (header = row 1)
            rows.push(obj);
        }
        return { columns: columns, rows: rows };
    }

    // ---- markup ensure + lifecycle ----
    function ensureMarkup() {
        if (document.getElementById('carrier-rate-card-section')) return Promise.resolve(true);
        if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
            return window.KM.partialLoader
                .loadPartial('carrier-rate-card', 'assets/html/pages/carrier-rate-card.html', '#carrier-rate-card-mount')
                .then(function () { return true; })
                .catch(function (err) { console.warn('[CarrierRateCard] partial load failed:', err); return false; });
        }
        return Promise.resolve(false);
    }

    // Expose inline handlers.
    window.crcSearch = search;
    window.crcExportUpdateTemplate = exportUpdateTemplate;
    window.crcExportMasterTemplate = exportMasterTemplate;
    window.crcExportTemplate = exportUpdateTemplate;   // back-compat alias (old single-button handler)
    window.crcOpenImport = openImport;
    window.crcImportTemplate = importTemplate;
    window.initCarrierRateCardPage = loadAndInit;

    if (window.KM && window.KM.lifecycle) {
        KM.lifecycle.register('carrier-rate-card-section', {
            mount: function () {
                ensureMarkup().then(function () {
                    var sec = document.getElementById('carrier-rate-card-section');
                    if (sec) sec.classList.add('active');
                    loadAndInit();
                });
            },
            unmount: function () {}
        });
    }
})();
