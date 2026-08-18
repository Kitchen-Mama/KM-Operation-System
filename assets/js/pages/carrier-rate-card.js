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

    // Carrier ids already warned about (missing carriers-master row) — warn once per session (F5).
    var crcWarnedCarriers = {};

    // ---- F1-7J-A3 · bounded scoped read cutover ----
    // Canonical mode sources the 3 tables this page reads (carrier_rate_cards, carriers, carrier_lead_times) from ONE
    // bounded getTable-based scoped read (KM.DB.loadScopedTables) — NO whole-DB loadOperationDb, NO app-prime dependency.
    // Kill switch: window.KM_SCOPED_PAGE_READS = false → Legacy. BEFORE == AFTER (same normalizers + filters). This is the
    // Carrier Rate Card MANAGEMENT page's own bounded owner — NOT coupled to the IR carrierPlanning include.
    var _crcReadModel = null;   // scoped read-model or null = Legacy
    var _CRC_TABLES = ['carrier_rate_cards', 'carriers', 'carrier_lead_times'];
    function _crcScopedActive() {
        return typeof window !== 'undefined' && window.KM_SCOPED_PAGE_READS !== false &&
            window.KM && window.KM.DB && typeof window.KM.DB.loadScopedTables === 'function' &&
            // F1-7M-B2-HOTFIX: cache-independent cloud eligibility (cold _opDbCache==null is still scoped-active) — was
            // getDataSourceMode() === 'google-sheet', which forced the first scoped page per session onto legacy getOperationDb.
            window.KM.DB.isScopedReadEligible && window.KM.DB.isScopedReadEligible();
    }
    function _crcGet(key, getterName) {
        if (_crcReadModel) return _crcReadModel[key] || [];
        return (window.KM.DB[getterName] && window.KM.DB[getterName]()) || [];
    }
    function _crcAfterWrite(cb) {
        if (!_crcScopedActive()) { if (cb) cb(); return; }
        window.KM.DB.loadScopedTables(_CRC_TABLES).then(function (m) { _crcReadModel = m; if (cb) cb(); }).catch(function () { if (cb) cb(); });
    }

    // ---- data accessors (read-model-first) ----
    function getCards() { return _crcGet('carrierRateCards', 'getCarrierRateCards'); }
    function getCarriers() { return _crcGet('carriers', 'getCarriers'); }
    function getLeadTimes() { return _crcGet('carrierLeadTimes', 'getCarrierLeadTimes'); }

    // ============================================================
    // F1 — Date-RANGE picker (self-contained; mirrors Forecast Review's contract, own crc- state/IDs).
    //  - display format YYYY-MM-DD via LOCAL getters (no UTC normalization)
    //  - inclusive two-date range (both endpoints); day clicks auto-swap so start<=end
    //  - manual day click clears the active preset; edits staged in `temp`, committed only on Apply
    // ============================================================
    var crcDateState = {
        range: { start: null, end: null, preset: null },   // committed (drives the filter)
        temp: { start: null, end: null, preset: null },     // staged inside the modal
        months: { start: new Date(), end: new Date() }
    };
    // Local YYYY-MM-DD (zero-padded) — never touches UTC.
    function crcFmt(d) {
        if (!d) return '';
        var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }
    function crcParseLocal(s) { var p = String(s).split('-'); return new Date(+p[0], (+p[1]) - 1, +p[2]); }
    function crcSameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

    // ---- Shared Date-Range Modal (#frDateModal) reuse ----
    // Reuses the SAME modal component + presets + calendar layout as Shipment Overview (index.html
    // #frDateModal / .fr-* classes) instead of a bespoke crc- modal — one look, one interaction. The
    // committed state, the date query (crcDateMatch / _crcReadFilters / search) and the "All dates" label
    // are unchanged. Handlers are bound via `.onclick=` on open, matching how each page claims the shared
    // modal while it is open (see purchase-order-list.js / shipping-history.js). Clear is preserved as a
    // small toolbar affordance next to the trigger (the shared modal footer stays Cancel/Apply only, so
    // Shipment Overview / PO-List are never polluted).
    var CRC_PRESET_LABELS = {
        'today': 'Today', 'yesterday': 'Yesterday',
        'last-7-days': 'Last 7 days', 'last-30-days': 'Last 30 days',
        'last-60-days': 'Last 60 days', 'last-90-days': 'Last 90 days',
        'last-month': 'Last month', 'last-2-months': 'Last 2 months',
        'last-3-months': 'Last 3 months', 'last-year': 'Last year'
    };

    function openDateModal() {
        var bd = document.getElementById('frDateBackdrop'), m = document.getElementById('frDateModal');
        if (!bd || !m) return;
        crcDateState.temp = { start: crcDateState.range.start, end: crcDateState.range.end, preset: crcDateState.range.preset };
        var anchor = crcDateState.range.start || new Date();
        crcDateState.months.start = new Date(anchor);
        crcDateState.months.end = new Date(crcDateState.range.end || anchor);
        bd.classList.add('is-open'); m.classList.add('is-open');
        crcSetupDateModalEvents();
        crcUpdateDateInputs(); crcUpdatePresetHighlight(); crcRenderCalendars();
    }
    // Claim the shared modal's controls for CRC (.onclick=, matching PO-List / Shipment Overview).
    function crcSetupDateModalEvents() {
        var bd = document.getElementById('frDateBackdrop'); if (bd) bd.onclick = closeDateModal;
        var cancel = document.getElementById('frDateCancel'); if (cancel) cancel.onclick = closeDateModal;
        var apply = document.getElementById('frDateApply'); if (apply) apply.onclick = dateApply;
        Array.prototype.forEach.call(document.querySelectorAll('#frDateModal .fr-preset-item'), function (it) {
            it.onclick = function () { presetClick(it.getAttribute('data-preset')); };
        });
        Array.prototype.forEach.call(document.querySelectorAll('#frDateModal .fr-calendar-nav'), function (btn) {
            btn.onclick = function () { calNav(btn.getAttribute('data-nav')); };
        });
    }
    function closeDateModal() {
        var bd = document.getElementById('frDateBackdrop'), m = document.getElementById('frDateModal');
        if (bd) bd.classList.remove('is-open');
        if (m) m.classList.remove('is-open');
    }
    // Commit staged range → filter state, re-derive facets, re-run search.
    function dateApply() {
        crcDateState.range = { start: crcDateState.temp.start, end: crcDateState.temp.end, preset: crcDateState.temp.preset };
        crcUpdateDateTriggerText();
        closeDateModal();
        _crcRebuildFacets();
        search();
    }
    // Clear (toolbar affordance beside the trigger) — reset to "All dates" and re-run immediately.
    function dateClear() {
        crcDateState.range = { start: null, end: null, preset: null };
        crcDateState.temp = { start: null, end: null, preset: null };
        crcUpdateDateTriggerText();
        _crcRebuildFacets();
        search();
    }
    function crcUpdateDateTriggerText() {
        var el = document.getElementById('crcDateTriggerText');
        var r = crcDateState.range;
        if (el) {
            if (!r.start && !r.end) el.textContent = 'All dates';
            else if (r.preset && CRC_PRESET_LABELS[r.preset]) el.textContent = CRC_PRESET_LABELS[r.preset];
            else el.textContent = crcFmt(r.start) + ' ~ ' + (r.end ? crcFmt(r.end) : '…');
        }
        // The Clear affordance shows only when a date filter is active (committed range).
        var clr = document.getElementById('crcDateClear');
        if (clr) clr.style.display = (r.start || r.end) ? '' : 'none';
    }
    // Preset compute — the FULL Shipment Overview preset set (10). A manual day-click clears the preset.
    function presetClick(preset) {
        var today = new Date(), start = new Date(), end = new Date(today);
        switch (preset) {
            case 'today': start = new Date(today); break;
            case 'yesterday': start.setDate(today.getDate() - 1); end.setDate(today.getDate() - 1); break;
            case 'last-7-days': start.setDate(today.getDate() - 7); break;
            case 'last-30-days': start.setDate(today.getDate() - 30); break;
            case 'last-60-days': start.setDate(today.getDate() - 60); break;
            case 'last-90-days': start.setDate(today.getDate() - 90); break;
            case 'last-month': start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); break;
            case 'last-2-months': start = new Date(today.getFullYear(), today.getMonth() - 2, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); break;
            case 'last-3-months': start = new Date(today.getFullYear(), today.getMonth() - 3, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); break;
            case 'last-year': start = new Date(today.getFullYear() - 1, 0, 1); end = new Date(today.getFullYear() - 1, 11, 31); break;
            default: return;
        }
        crcDateState.temp = { start: start, end: end, preset: preset };
        crcDateState.months.start = new Date(start); crcDateState.months.end = new Date(end);
        crcUpdateDateInputs(); crcUpdatePresetHighlight(); crcRenderCalendars();
    }
    function crcUpdatePresetHighlight() {
        var p = crcDateState.temp.preset;
        Array.prototype.forEach.call(document.querySelectorAll('#frDateModal .fr-preset-item'), function (it) {
            if (it.getAttribute('data-preset') === p) it.classList.add('is-active'); else it.classList.remove('is-active');
        });
    }
    function crcUpdateDateInputs() {
        var s = document.getElementById('frStartDisplay'), e = document.getElementById('frEndDisplay');
        if (s) s.value = crcFmt(crcDateState.temp.start);
        if (e) e.value = crcFmt(crcDateState.temp.end);
    }
    function calNav(nav) {
        var mo = crcDateState.months;
        if (nav === 'prev-start') mo.start.setMonth(mo.start.getMonth() - 1);
        else if (nav === 'next-start') mo.start.setMonth(mo.start.getMonth() + 1);
        else if (nav === 'prev-end') mo.end.setMonth(mo.end.getMonth() - 1);
        else if (nav === 'next-end') mo.end.setMonth(mo.end.getMonth() + 1);
        crcRenderCalendars();
    }
    function crcRenderCalendars() { crcRenderCalendar('start'); crcRenderCalendar('end'); }
    function crcRenderCalendar(type) {
        var month = crcDateState.months[type];
        var cap = type.charAt(0).toUpperCase() + type.slice(1);
        var titleEl = document.getElementById('frCalendar' + cap + 'Title');
        var bodyEl = document.getElementById('frCalendar' + cap + 'Body');
        if (!titleEl || !bodyEl) return;
        var names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        titleEl.textContent = names[month.getMonth()] + ' ' + month.getFullYear();
        var lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
        var startDow = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
        var wk = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], html = '';
        wk.forEach(function (d) { html += '<div class="fr-calendar-weekday">' + d + '</div>'; });
        for (var i = 0; i < startDow; i++) html += '<div class="fr-calendar-day is-disabled"></div>';
        var start = crcDateState.temp.start, end = crcDateState.temp.end, today = new Date();
        for (var day = 1; day <= lastDay.getDate(); day++) {
            var date = new Date(month.getFullYear(), month.getMonth(), day);
            var cls = ['fr-calendar-day'];
            if (start && crcSameDay(date, start)) cls.push('is-start');
            if (end && crcSameDay(date, end)) cls.push('is-end');
            if (start && end && date > start && date < end) cls.push('is-in-range');
            if (crcSameDay(date, today)) cls.push('is-today');
            // data-date uses LOCAL YYYY-MM-DD (crcFmt) so read-back never shifts a day (no toISOString/UTC).
            html += '<div class="' + cls.join(' ') + '" data-date="' + crcFmt(date) + '" data-type="' + type + '">' + day + '</div>';
        }
        bodyEl.innerHTML = html;
        Array.prototype.forEach.call(bodyEl.querySelectorAll('.fr-calendar-day:not(.is-disabled)'), function (el) {
            el.addEventListener('click', function () { crcDayClick(crcParseLocal(el.getAttribute('data-date')), el.getAttribute('data-type')); });
        });
    }
    // Clicking a day: auto-swap so the range stays ordered; a manual click clears the preset.
    function crcDayClick(date, calType) {
        var start = crcDateState.temp.start, end = crcDateState.temp.end;
        if (calType === 'start') {
            if (end && date > end) { crcDateState.temp.start = end; crcDateState.temp.end = date; }
            else crcDateState.temp.start = date;
        } else {
            if (start && date < start) { crcDateState.temp.end = start; crcDateState.temp.start = date; }
            else crcDateState.temp.end = date;
        }
        crcDateState.temp.preset = null;
        crcUpdateDateInputs(); crcUpdatePresetHighlight(); crcRenderCalendars();
    }
    // Rate-card date match: card effective window [effectiveFrom, effectiveTo] (blank effectiveTo =
    // open-ended) must OVERLAP the selected [start, end] range (inclusive). Strings are YYYY-MM-DD so
    // lexical comparison is chronological. Consistent with the old single-date [from, to] containment.
    function crcDateMatch(c, start, end) {
        if (!start && !end) return true;
        var ef = c.effectiveFrom || '', et = c.effectiveTo || '';
        if (start && et && et < start) return false;   // card ended before the range starts
        if (end && ef && ef > end) return false;         // card starts after the range ends
        return true;
    }

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

        // F1-7J-A3: canonical → bounded scoped read (carrier_rate_cards + carriers + carrier_lead_times); Legacy
        // kill-switch → broad loadOperationDb. Fail-closed: on scoped-read failure init WITHOUT a broad fallback.
        if (_crcScopedActive()) {
            if (_crcReadModel) { _crcInit(); return; }
            window.KM.DB.loadScopedTables(_CRC_TABLES).then(function (m) { _crcReadModel = m; _crcInit(); }).catch(function () { _crcInit(); });
        } else if (!window._opDbCache && window.KM.DB.loadOperationDb) {
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

    // Populate all filter dropdowns (faceted) + the date trigger label. Table stays empty until Search.
    function _crcPopulateFilters() {
        crcUpdateDateTriggerText();
        _crcRebuildFacets();
    }

    // ============================================================
    // F2–F6 — Dependent (faceted) filters.
    // Order: Date → Country → Method → Carrier → Last Mile. Each dropdown's options are computed from the
    // rate-card rows STILL matching every UPSTREAM selection (Date included). The SAME filter state feeds
    // both the dropdown facets and the Search query. When an upstream change invalidates a downstream
    // selection, it is reset to "All" and its options are rebuilt.
    // ============================================================
    // ---- Multi-select checkbox filters (Country / Method / Carrier / Last Mile) ----
    // Converted 2026-07-28 from plain <select>s to the SKU-Details checkbox dropdown template (search +
    // Select All + Clear + scrollable checkbox list + outside-click/Esc). Each filter's selection is an
    // ARRAY ([] = All); the query keeps the same "empty = no filter" semantics, extended from equality to
    // membership. Cascading (Date→Country→Method→Carrier→Last Mile) + downstream pruning are preserved.
    var crcFilterState = { country: [], method: [], carrier: [], lastMile: [] };
    var _crcFilterCandidates = { country: [], method: [], carrier: [], lastMile: [] };  // full universe per kind
    var _crcFilterOpts = { country: [], method: [], carrier: [], lastMile: [] };        // last-rendered {value,label}[]
    var CRCF_ORDER = ['country', 'method', 'carrier', 'lastMile'];
    var CRCF_IDS = { country: 'crcCountry', method: 'crcMethod', carrier: 'crcCarrier', lastMile: 'crcLastMile' };

    function _crcReadFilters() {
        return {
            dateStart: crcFmt(crcDateState.range.start),
            dateEnd: crcFmt(crcDateState.range.end),
            country: crcFilterState.country.slice(),
            method: crcFilterState.method.slice(),
            carrier: crcFilterState.carrier.slice(),
            lastMile: crcFilterState.lastMile.slice()
        };
    }
    // Carrier-scoped exports (Update / Master template) require EXACTLY ONE carrier — return it, else ''.
    function _crcSingleCarrier() { return crcFilterState.carrier.length === 1 ? crcFilterState.carrier[0] : ''; }

    // Distinct, trimmed, non-empty values of `field` across `rows`, sorted. `upper` uppercases (country).
    function _crcDistinct(rows, field, upper) {
        var seen = {}, list = [];
        rows.forEach(function (c) {
            var v = String(c[field] == null ? '' : c[field]).trim();
            if (upper) v = v.toUpperCase();
            if (v && !seen[v]) { seen[v] = 1; list.push(v); }
        });
        list.sort();
        return list;
    }
    function _crcValOpts(vals) { return vals.map(function (v) { return { value: v, label: v }; }); }
    // Method filter DISPLAY labels (Filter Consistency Repair). The option VALUE stays the raw DB enum
    // (air / sea / sea_express / truck / rail / …); ONLY the shown label is the formal frontend text.
    // Selection state, filter payload and the .filter() match (`c.shippingMethod`) all keep the canonical
    // enum — nothing is sent to the backend as a label. An unmapped-but-legal enum is title-cased (never
    // dropped or renamed) so new enums still read cleanly without a schema/label change.
    var CRC_METHOD_LABELS = { air: 'Air', sea: 'Sea', sea_express: 'Sea Express', truck: 'Truck', rail: 'Rail', courier: 'Courier' };
    function _crcMethodLabel(v) {
        var key = String(v == null ? '' : v).trim().toLowerCase();
        if (!key) return String(v == null ? '' : v);
        if (CRC_METHOD_LABELS[key]) return CRC_METHOD_LABELS[key];
        return key.split(/[_\s]+/).map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }).join(' ');
    }
    function _crcMethodOpts(vals) { return vals.map(function (v) { return { value: v, label: _crcMethodLabel(v) }; }); }
    // F5 — Carrier options from rate-card rows (never hide a card): value = carrier_id, label = carrier_name
    // joined via carrier_id → carriers.carrier_id. Each carrier_id once. No master row → "Unmapped Carrier
    // ({id})" + a one-time console.warn. carrier_name is NEVER used as the join key or fabricated.
    function _crcCarrierOptions(rows) {
        var nameById = {};
        getCarriers().forEach(function (c) { if (c.carrierId) nameById[c.carrierId] = String(c.carrierName == null ? '' : c.carrierName).trim(); });
        var seen = {}, opts = [];
        rows.forEach(function (c) {
            var id = String(c.carrierId == null ? '' : c.carrierId).trim();
            if (!id || seen[id]) return;
            seen[id] = 1;
            var name = nameById[id];
            if (name) {
                opts.push({ id: id, label: name });
            } else {
                if (!crcWarnedCarriers[id]) {
                    crcWarnedCarriers[id] = 1;
                    console.warn('[CRC] mapping warning: carrier_id "' + id + '" has no matching carriers master row — showing "Unmapped Carrier (' + id + ')". The rate card is NOT hidden.');
                }
                opts.push({ id: id, label: 'Unmapped Carrier (' + id + ')' });
            }
        });
        opts.sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); });
        return opts;
    }

    // ---- checkbox-panel rendering + behavior (per filter `kind`) ----
    function _crcPruneState(kind, validValues) {
        crcFilterState[kind] = crcFilterState[kind].filter(function (v) { return validValues.indexOf(v) !== -1; });
    }
    function _crcLabelForValue(kind, val) {
        var hit = (_crcFilterOpts[kind] || []).filter(function (o) { return o.value === val; })[0];
        return hit ? hit.label : val;
    }
    function _crcUpdateFilterLabel(kind) {
        var el = document.getElementById(CRCF_IDS[kind] + 'Label');
        if (!el) return;
        var n = crcFilterState[kind].length;
        el.textContent = n === 0 ? 'All' : (n === 1 ? _crcLabelForValue(kind, crcFilterState[kind][0]) : (n + ' selected'));
    }
    function _crcRenderFilterOptions(kind, opts) {
        _crcFilterCandidates[kind] = opts.map(function (o) { return o.value; });
        _crcFilterOpts[kind] = opts;
        var list = document.getElementById(CRCF_IDS[kind] + 'List');
        if (!list) return;
        var sel = crcFilterState[kind];
        if (!opts.length) {
            list.innerHTML = '<div class="crcf-empty">No options</div>';
        } else {
            list.innerHTML = opts.map(function (o) {
                var checked = sel.indexOf(o.value) !== -1;
                return '<label class="crcf-item" role="option" aria-selected="' + (checked ? 'true' : 'false') + '">' +
                    '<input type="checkbox" value="' + esc(o.value) + '" onchange="crcOnFilterToggle(\'' + kind + '\')"' + (checked ? ' checked' : '') + '>' +
                    '<span>' + esc(o.label) + '</span></label>';
            }).join('');
        }
        var searchEl = document.getElementById(CRCF_IDS[kind] + 'Search');
        if (searchEl && searchEl.value) _crcApplyOptionSearch(kind, searchEl.value);
    }
    function crcOnFilterToggle(kind) {
        var list = document.getElementById(CRCF_IDS[kind] + 'List');
        if (!list) return;
        var checked = [];
        Array.prototype.forEach.call(list.querySelectorAll('input[type="checkbox"]:checked'), function (cb) { checked.push(cb.value); });
        crcFilterState[kind] = checked;
        _crcUpdateFilterLabel(kind);
        _crcRebuildFacets(kind);   // prune + rebuild DOWNSTREAM facets (skip re-rendering the active list)
    }
    function crcFilterSelectAll(kind) {
        crcFilterState[kind] = (_crcFilterCandidates[kind] || []).slice();
        _crcRenderFilterOptions(kind, _crcFilterOpts[kind] || []);
        _crcUpdateFilterLabel(kind);
        _crcRebuildFacets(kind);
    }
    function crcFilterClear(kind) {
        crcFilterState[kind] = [];
        _crcRenderFilterOptions(kind, _crcFilterOpts[kind] || []);
        _crcUpdateFilterLabel(kind);
        _crcRebuildFacets(kind);
    }
    function crcOnFilterOptionSearch(kind) {
        var searchEl = document.getElementById(CRCF_IDS[kind] + 'Search');
        _crcApplyOptionSearch(kind, searchEl ? searchEl.value : '');
    }
    function _crcApplyOptionSearch(kind, q) {
        var list = document.getElementById(CRCF_IDS[kind] + 'List');
        if (!list) return;
        var low = String(q || '').toLowerCase();
        Array.prototype.forEach.call(list.querySelectorAll('.crcf-item'), function (item) {
            var t = (item.textContent || '').toLowerCase();
            item.style.display = (!low || t.indexOf(low) !== -1) ? '' : 'none';
        });
    }
    function crcToggleFilterPanel(kind, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        var panel = document.getElementById(CRCF_IDS[kind] + 'Panel');
        if (!panel) return;
        var willOpen = panel.hidden;
        _crcCloseFilterPanels();
        if (willOpen) {
            panel.hidden = false;
            var trigger = document.getElementById(CRCF_IDS[kind] + 'Trigger');
            if (trigger) trigger.setAttribute('aria-expanded', 'true');
        }
    }
    function _crcCloseFilterPanels() {
        CRCF_ORDER.forEach(function (kind) {
            var p = document.getElementById(CRCF_IDS[kind] + 'Panel'); if (p) p.hidden = true;
            var t = document.getElementById(CRCF_IDS[kind] + 'Trigger'); if (t) t.setAttribute('aria-expanded', 'false');
        });
    }

    // Rebuild every facet's checkbox universe from the rows matching the UPSTREAM selections, pruning any
    // now-invalid selections. `skipKind` (optional) = the filter the user just toggled — its own list is
    // left intact (so their checkboxes / scroll position don't jump), only its downstream facets rebuild.
    function _crcRebuildFacets(skipKind) {
        var cards = getCards();
        var dateStart = crcFmt(crcDateState.range.start), dateEnd = crcFmt(crcDateState.range.end);
        var dateRows = cards.filter(function (c) { return crcDateMatch(c, dateStart, dateEnd); });

        // F2 — Country (uppercase codes) from date rows.
        var countryVals = _crcDistinct(dateRows, 'destinationCountry', true);
        _crcPruneState('country', countryVals);
        if (skipKind !== 'country') _crcRenderFilterOptions('country', _crcValOpts(countryVals));

        // F3 — Method from Date + Country.
        var cSel = crcFilterState.country;
        var methodRows = dateRows.filter(function (c) { return !cSel.length || cSel.indexOf(up(c.destinationCountry)) !== -1; });
        var methodVals = _crcDistinct(methodRows, 'shippingMethod');
        _crcPruneState('method', methodVals);
        if (skipKind !== 'method') _crcRenderFilterOptions('method', _crcMethodOpts(methodVals));

        // F5 — Carrier from Date + Country + Method.
        var mSel = crcFilterState.method;
        var carrierRows = methodRows.filter(function (c) { return !mSel.length || mSel.indexOf(String(c.shippingMethod || '')) !== -1; });
        var carrierOpts = _crcCarrierOptions(carrierRows);
        _crcPruneState('carrier', carrierOpts.map(function (o) { return o.id; }));
        if (skipKind !== 'carrier') _crcRenderFilterOptions('carrier', carrierOpts.map(function (o) { return { value: o.id, label: o.label }; }));

        // F4 — Last Mile from Date + Country + Method + Carrier.
        var caSel = crcFilterState.carrier;
        var mileRows = carrierRows.filter(function (c) { return !caSel.length || caSel.indexOf(String(c.carrierId || '')) !== -1; });
        var mileVals = _crcDistinct(mileRows, 'lastMileDelivery');
        _crcPruneState('lastMile', mileVals);
        if (skipKind !== 'lastMile') _crcRenderFilterOptions('lastMile', _crcValOpts(mileVals));

        CRCF_ORDER.forEach(_crcUpdateFilterLabel);
    }
    // Kept for compatibility (was the selects' onchange) — a full facet rebuild.
    function onFilterChange() { _crcRebuildFacets(); }

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
        var rows = getLeadTimes();   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
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

        // Same filter state that feeds the dropdown facets (F6) — never query a different set. Each filter
        // is now an array ([] = All); a card must match ONE of the selected values (membership), preserving
        // the old "empty = no filter" behavior. Country is compared as an uppercase code.
        var f = _crcReadFilters();

        var cards = getCards();
        var nameById = {};
        getCarriers().forEach(function (c) { if (c.carrierId) nameById[c.carrierId] = c.carrierName || c.carrierId; });

        var filtered = cards.filter(function (c) {
            if (!crcDateMatch(c, f.dateStart, f.dateEnd)) return false;                                          // F1 — date-range overlap
            if (f.country.length && f.country.indexOf(up(c.destinationCountry)) === -1) return false;            // F2 — country code(s)
            if (f.method.length && f.method.indexOf(String(c.shippingMethod || '')) === -1) return false;        // F3
            if (f.carrier.length && f.carrier.indexOf(String(c.carrierId || '')) === -1) return false;           // F5
            if (f.lastMile.length && f.lastMile.indexOf(String(c.lastMileDelivery || '')) === -1) return false;  // F4
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
        var fCarrier = _crcSingleCarrier();
        if (!fCarrier) { alert('Please select exactly one carrier before exporting Update Template.'); return; }

        var carriers = getCarriers();   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
        var nameById = {};
        carriers.forEach(function (c) { if (c.carrierId) nameById[c.carrierId] = c.carrierName || c.carrierId; });
        var carrierName = nameById[fCarrier] || fCarrier;

        // Scope: that carrier's ACTIVE rows only (independent of the date/country filters, so the carrier
        // receives their full current rate set).
        var all = getCards();   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
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
        var all = getCards();   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
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

    // ============================================================
    // Phase 2 — Carrier XLSX templates (TEMPLATE_UI_STANDARD_SPEC via KM.templateExport)
    // Builds the carrier field-spec (editable/locked/required + enum dropdowns + _SYSTEM) and
    // hands it to the GENERIC runtime. The existing CSV exports above are left untouched.
    // ============================================================
    var CRC_TEMPLATE_VERSION = '1.0';
    // Global Logistics Enums (CARRIER_AND_ROUTE_SPEC §4.5) — DB English enums for dropdowns.
    var CRC_ENUMS = {
        status: ['active', 'inactive'],
        battery_type: ['no_battery', 'alkaline_battery', 'lithium_battery', 'rechargeable_lithium'],
        customs_type: ['third_party_customs', 'tax_refund_customs', 'formal_customs'],
        transit_type: ['air', 'sea', 'sea_express', 'rail', 'truck'],
        last_mile_delivery: ['parcel', 'truck'],
        shipping_method: ['Sea', 'Sea Express', 'Air', 'Courier'],
        charge_type: ['weight', 'volume', 'container', 'shipment', 'carton'],
        charge_unit: ['kg', 'lb', 'cbm', '20GP', '40HQ', 'shipment', 'carton'],
        currency: ['USD', 'TWD', 'CNY', 'EUR', 'GBP']
    };
    // Update Template — editable fields on EXISTING rows (this task Part C/D — includes min_charge).
    // NOTE: this extends CARRIER §4C.3A (which listed min_charge as locked); importer aligned in 17_.
    var CRC_UPDATE_EDITABLE = { unit_rate: 1, min_charge: 1, fuel_surcharge: 1, customs_fee: 1, doc_fee: 1, effective_from: 1, effective_to: 1, status: 1, note: 1 };
    // Update Template — CURATED visible columns (Part C). Reference/context = gray (locked); editable = white.
    // Everything NOT in these two lists is written but HIDDEN (preserved for import traceability, incl. rate_card_id).
    var CRC_UPDATE_VISIBLE_REF = ['carrier_name', 'origin_country', 'destination_country', 'destination_warehouse_code',
        'destination_city', 'destination_postal_code_start', 'destination_postal_code_end', 'shipping_method',
        'last_mile_delivery', 'shipping_method_label', 'battery_type', 'weight_tier', 'weight_tier_unit', 'currency', 'charge_unit'];
    var CRC_UPDATE_VISIBLE_EDIT = ['unit_rate', 'min_charge', 'fuel_surcharge', 'customs_fee', 'doc_fee',
        'effective_from', 'effective_to', 'status', 'note'];
    // Hidden-but-preserved columns (Part C). row_type + all fields not in the visible lists.
    var CRC_UPDATE_HIDDEN = ['row_type', 'rate_card_id', 'carrier_id', 'origin_city', 'marketplace',
        'charge_type', 'dim_divisor', 'min_box_weight', 'min_box_weight_unit', 'transit_type', 'customs_type'];
    // Master Template — required-for-new-row fields (CARRIER §4C.3B / TEMPLATE §12).
    var CRC_MASTER_REQUIRED = { carrier_id: 1, origin_country: 1, destination_country: 1, shipping_method: 1, last_mile_delivery: 1, charge_type: 1, charge_unit: 1, currency: 1, unit_rate: 1, effective_from: 1, effective_to: 1 };
    // BUSINESS EDITABLE fields — the ONLY columns shown YELLOW (editable) in BOTH Master and Update
    // templates. Yellow = business editable (NOT "required"). Everything else: Master = white/editable,
    // Update = gray/locked reference.
    var CRC_BUSINESS_EDITABLE = {
        currency: 1, unit_rate: 1, destination_country: 1, destination_city: 1,
        destination_postal_code_start: 1, destination_postal_code_end: 1,
        destination_warehouse_code: 1, shipping_method: 1, last_mile_delivery: 1
    };
    // Prepared template area — yellow business fill + validations extend down to this row (Part 3).
    var CRC_TEMPLATE_MAX_ROW = 5000;
    var CRC_COMMENTS = {
        effective_from: 'yyyy-mm-dd',
        effective_to: 'blank = open-ended (no expiration)',
        rate_card_id: 'blank creates a NEW row; filled UPDATES the existing row',
        carrier_id: 'blank can be resolved from carrier_name (must match an existing carrier; unknown = rejected)',
        shipping_method_label: 'Localized display name (e.g. 美森海派 / 空派). Admin-editable in Master; locked in Update.'
    };
    var CRC_COLS_FALLBACK = ['row_type', 'rate_card_id', 'carrier_id', 'carrier_name', 'origin_country', 'origin_city',
        'destination_country', 'destination_city', 'destination_postal_code_start', 'destination_postal_code_end',
        'destination_warehouse_code', 'marketplace', 'shipping_method', 'last_mile_delivery', 'charge_type', 'charge_unit',
        'dim_divisor', 'min_box_weight', 'min_box_weight_unit', 'weight_tier', 'weight_tier_unit', 'currency',
        'unit_rate', 'min_charge', 'fuel_surcharge', 'customs_fee', 'doc_fee', 'transit_type', 'battery_type',
        'customs_type', 'shipping_method_label', 'note', 'effective_from', 'effective_to', 'status'];

    function crcXlsxReady() {
        if (!window.KM || !window.KM.templateExport || !window.KM.templateExport.isReady()) {
            alert('XLSX engine (ExcelJS) is not loaded — cannot export a formatted template. Use the CSV export instead, or reload the page.');
            return false;
        }
        return true;
    }
    // Normalized rate-card → template row object (same field mapping as the CSV export).
    function crcRowToTemplateObj(r, mode, nameById) {
        var master = (mode === 'master');
        return {
            row_type: 'data', rate_card_id: r.rateCardId || '',
            carrier_id: r.carrierId, carrier_name: nameById[r.carrierId] || r.carrierName || '',
            origin_country: r.originCountry, origin_city: r.originCity,
            destination_country: r.destinationCountry, destination_city: r.destinationCity,
            destination_postal_code_start: r.destinationPostalCodeStart, destination_postal_code_end: r.destinationPostalCodeEnd,
            destination_warehouse_code: r.destinationWarehouseCode, marketplace: r.marketplace,
            shipping_method: r.shippingMethod, last_mile_delivery: r.lastMileDelivery, charge_type: r.chargeType, charge_unit: r.chargeUnit,
            dim_divisor: r.dimDivisor, min_box_weight: r.minBoxWeight, min_box_weight_unit: r.minBoxWeightUnit,
            weight_tier: r.weightTier, weight_tier_unit: r.weightTierUnit, currency: r.currency,
            unit_rate: master ? (r.unitRate != null ? r.unitRate : '') : '',
            min_charge: r.minCharge, fuel_surcharge: r.fuelSurcharge, customs_fee: r.customsFee, doc_fee: r.docFee,
            transit_type: r.transitType, battery_type: r.batteryType, customs_type: r.customsType,
            note: r.note,
            effective_from: master ? (r.effectiveFrom || '') : '',
            effective_to: master ? (r.effectiveTo || '') : '',
            status: r.status || 'active'
        };
    }
    var CRC_EXAMPLE = {
        row_type: 'example', rate_card_id: '', carrier_id: 'CARRIER-EXAMPLE', carrier_name: 'Example Forwarder',
        origin_country: 'CN', origin_city: 'Shenzhen', destination_country: 'US', destination_city: 'Los Angeles',
        destination_postal_code_start: '', destination_postal_code_end: '', destination_warehouse_code: 'ONT8',
        marketplace: 'Amazon', shipping_method: 'Sea', last_mile_delivery: 'parcel', charge_type: 'weight', charge_unit: 'kg',
        dim_divisor: '6000', min_box_weight: '', min_box_weight_unit: 'kg', weight_tier: '100', weight_tier_unit: 'kg',
        currency: 'USD', unit_rate: '3.50', min_charge: '150', fuel_surcharge: '', customs_fee: '', doc_fee: '',
        transit_type: 'sea', battery_type: 'no_battery', customs_type: 'tax_refund_customs',
        note: 'EXAMPLE ROW — ignored on import', effective_from: '2026-08-01', effective_to: '2026-12-31', status: 'active'
    };
    // Build the generic-runtime spec for a carrier template.
    function crcBuildTemplateSpec(mode, rows, scope) {
        var columns;
        if (mode === 'update') {
            // Curated Update layout: YELLOW business-editable columns + gray/locked reference/other,
            // then the hidden-but-preserved columns (Excel-hidden; still written for import traceability).
            var ordered = CRC_UPDATE_VISIBLE_REF.concat(CRC_UPDATE_VISIBLE_EDIT).concat(CRC_UPDATE_HIDDEN);
            columns = ordered.map(function (key) {
                var isHidden = CRC_UPDATE_HIDDEN.indexOf(key) !== -1;
                // Business editable → yellow/editable; every other visible column → gray/locked reference.
                var kind = isHidden ? 'locked' : (CRC_BUSINESS_EDITABLE[key] ? 'business' : 'locked');
                var col = { key: key, header: key, kind: kind, hidden: isHidden };
                if (!isHidden && kind === 'business' && CRC_ENUMS[key]) col.dropdown = CRC_ENUMS[key];   // currency / shipping_method / last_mile_delivery
                if (!isHidden && CRC_COMMENTS[key]) col.comment = CRC_COMMENTS[key];
                return col;
            });
        } else {
            // Master — full canonical column set (column set unchanged). YELLOW business-editable columns;
            // everything else WHITE/editable (admin edits all; Master never locks / never protects).
            var cols = (window.KM.DB && window.KM.DB.CARRIER_RATE_TEMPLATE_COLS) || CRC_COLS_FALLBACK;
            columns = cols.map(function (key) {
                var kind = CRC_BUSINESS_EDITABLE[key] ? 'business' : 'editable';
                var col = { key: key, header: key, kind: kind };
                if (CRC_ENUMS[key]) col.dropdown = CRC_ENUMS[key];
                if (CRC_COMMENTS[key]) col.comment = CRC_COMMENTS[key];
                return col;
            });
        }
        return {
            sheetName: 'CarrierRates',
            columns: columns,
            rows: rows || [],
            exampleRow: CRC_EXAMPLE,
            // Master Template = admin master-data maintenance → fully editable, no locked/gray/protection.
            // Update Template keeps the restricted (locked/gray/protected) rule. YELLOW = business editable in both.
            masterTemplate: (mode === 'master'),
            templateMaxRow: CRC_TEMPLATE_MAX_ROW,   // yellow business fill + validations through row 5000 (Part 3)
            instructionRow: (mode === 'master')
                ? 'Carrier Rate MASTER Template — all fields editable (admin master data). YELLOW = business editable fields. Blank rate_card_id = new row (auto-ID on import). row_type=example is ignored. No Lead Time columns.'
                : 'Carrier Rate UPDATE Template' + (scope && scope.carrier_name ? ' (' + scope.carrier_name + ')' : '') + ' — YELLOW = business editable fields; gray = locked reference (importer keeps original). Blank rows = New Rate Card. Fill business editable fields; reference fields should reuse existing values. row_type=example is ignored.',
            system: {
                template_id: (mode === 'master') ? 'carrier_rate_master' : 'carrier_rate_update',
                template_name: (mode === 'master') ? 'Carrier Rate Master Template' : 'Carrier Rate Update Template',
                template_version: CRC_TEMPLATE_VERSION,
                module: 'carrier_rate',
                generated_at: new Date().toISOString(),
                generated_by: 'operation-system',
                export_mode: mode,
                source_system: 'kmos',
                carrier_id: scope ? (scope.carrier_id || '') : '',
                carrier_name: scope ? (scope.carrier_name || '') : '',
                notes: (mode === 'master')
                    ? 'All fields editable (yellow = business editable); blank rate_card_id creates new rows; carrier_id may resolve from carrier_name.'
                    : 'Carrier-scoped. Yellow = business editable; gray = locked reference. Blank rows = new rate card; reference fields reuse existing values.'
            }
        };
    }

    // Export Update Template (XLSX) — carrier-scoped (mirrors the CSV update rules).
    function exportUpdateTemplateXlsx(carrierIdArg) {
        if (!useDb()) { alert('Enable the cloud DB first.'); return; }
        if (!crcXlsxReady()) return;
        // Carrier id comes from an explicit arg (Update Rate Card modal) or the page filter.
        var fCarrier = (typeof carrierIdArg === 'string' && carrierIdArg) ? carrierIdArg : _crcSingleCarrier();
        if (!fCarrier) { alert('Please select exactly one carrier before exporting Update Template.'); return; }
        var carriers = getCarriers();   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
        var nameById = {};
        carriers.forEach(function (c) { if (c.carrierId) nameById[c.carrierId] = c.carrierName || c.carrierId; });
        var carrierName = nameById[fCarrier] || fCarrier;
        var all = getCards();   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
        var scoped = all.filter(function (c) {
            return String(c.carrierId || '') === fCarrier && String(c.status || 'active').toLowerCase() !== 'inactive';
        });
        if (!scoped.length && !confirm('No active rate rows for ' + carrierName + '. Export an Update Template with only the example row?')) return;
        var rows = scoped.map(function (r) { return crcRowToTemplateObj(r, 'update', nameById); });
        var spec = crcBuildTemplateSpec('update', rows, { carrier_id: fCarrier, carrier_name: carrierName });
        spec.filename = 'carrier_rate_update_' + safeFile(carrierName) + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
        window.KM.templateExport.buildAndDownload(spec)
            .then(function (res) { console.log('[CarrierRateCard] exported update XLSX:', res); })
            .catch(function (e) { alert('XLSX export failed: ' + (e && e.message ? e.message : e)); });
    }

    // Export Master Template (XLSX) — all carriers / all fields editable.
    function exportMasterTemplateXlsx() {
        if (!useDb()) { alert('Enable the cloud DB first.'); return; }
        if (!crcXlsxReady()) return;
        var carriers = getCarriers();   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
        var nameById = {};
        carriers.forEach(function (c) { if (c.carrierId) nameById[c.carrierId] = c.carrierName || c.carrierId; });
        var all = getCards();   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
        if (!all.length && !confirm('No carrier rate cards loaded. Export a Master Template with only the example row?')) return;
        var rows = all.map(function (r) { return crcRowToTemplateObj(r, 'master', nameById); });
        var spec = crcBuildTemplateSpec('master', rows, null);
        spec.filename = 'carrier_rate_master_' + new Date().toISOString().slice(0, 10) + '.xlsx';
        window.KM.templateExport.buildAndDownload(spec)
            .then(function (res) { console.log('[CarrierRateCard] exported master XLSX:', res); })
            .catch(function (e) { alert('XLSX export failed: ' + (e && e.message ? e.message : e)); });
    }

    // ---- Template Import (append-only; validated server-side) ----
    var CRC_FORBIDDEN_COLS = ['transit_days', 'min_days', 'max_days', 'avg_days', 'lead_time_id'];

    function openImport() {
        if (!useDb()) { alert('Enable the cloud DB to import Carrier Rate Templates.'); return; }
        var input = document.getElementById('crcImportFile');
        if (input) { input.value = ''; input.click(); }
    }

    // Legacy hidden CSV import button path — delegates to the shared file importer (page-filter scope).
    function importTemplate(input) {
        if (!input || !input.files || !input.files[0]) return;
        var pageCarrier = _crcSingleCarrier();
        crcImportFile(input.files[0], pageCarrier);
    }

    // Shared: read a CSV or XLSX file → parsed {columns, rows} → run the import (existing backend).
    // NOTE: this feeds the EXISTING importCarrierRateTemplate / handleImportCarrierRateCards_ backend
    // (direct import). The Import Job runtime is NOT implemented here.
    function crcImportFile(file, carrierScopeId, forceMode) {
        if (!file) { alert('Choose a file to import.'); return; }
        var isXlsx = /\.xlsx$/i.test(file.name);
        var done = function (parsed) { crcRunImport(parsed, file.name, carrierScopeId, forceMode); };
        if (isXlsx) {
            crcReadXlsxFile(file).then(done).catch(function (err) {
                alert('Could not read the XLSX file: ' + (err && err.message ? err.message : err));
            });
        } else {
            var reader = new FileReader();
            reader.onload = function (e) {
                var parsed;
                try { parsed = _crcParseCsv(String(e.target.result || '')); }
                catch (err) { alert('Could not parse the file: ' + (err && err.message ? err.message : err)); return; }
                done(parsed);
            };
            reader.onerror = function () { alert('Could not read the file.'); };
            reader.readAsText(file);
        }
    }

    // Post-parse import (shared by CSV + XLSX paths). Unchanged backend contract.
    function crcRunImport(parsed, fileName, carrierScopeId, forceMode) {
        parsed = parsed || {};
        if (!parsed.columns || !parsed.columns.length) { alert('The file has no header row.'); return; }
        var bad = parsed.columns.filter(function (c) { return CRC_FORBIDDEN_COLS.indexOf(low(c)) !== -1; });
        if (bad.length) {
            alert('Import blocked — these columns are not allowed in a Carrier Rate Template:\n\n' + bad.join(', ') +
                '\n\nLead Time (min_days / max_days / avg_days) and transit_days are maintained separately in carrier_lead_times, not on rate cards.');
            return;
        }
        if (!parsed.rows || !parsed.rows.length) { alert('The file has no data rows.'); return; }
        // Master modal forces 'master'; otherwise infer from the filename (Update modal / legacy path).
        var mode = forceMode || (/master/i.test(fileName || '') ? 'master' : 'update');
        var payload = { rows: parsed.rows, columns: parsed.columns, source_file_name: fileName || 'carrier_rate_template', mode: mode };
        if (carrierScopeId) payload.carrier_scope = { carrier_id: carrierScopeId };
        window.KM.DB.importCarrierRateTemplate(payload)
            // F1-7J-A3: canonical → scoped re-read before re-search (writer refreshed the broad cache the page no longer reads).
            .then(function (data) { _crcShowImportResult(data, mode); _crcAfterWrite(function () { if (crcSearched) search(); }); })
            .catch(function (err) { alert('Import failed: ' + (err && err.message ? err.message : err)); });
    }

    // Client-side XLSX → {columns, rows} using ExcelJS (already loaded). Reads the first non-_SYSTEM
    // sheet; header row = the row containing 'row_type' / 'rate_card_id' (skips the instruction banner).
    function crcCellText(v) {
        if (v == null) return '';
        if (typeof v === 'object') {
            if (v.text != null) return String(v.text);
            if (v.result != null) return String(v.result);
            if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
            if (typeof v.getTime === 'function') { try { return v.toISOString().slice(0, 10); } catch (e) { return String(v); } }
            return '';
        }
        return String(v);
    }
    function crcReadXlsxFile(file) {
        if (!window.ExcelJS || !window.ExcelJS.Workbook) return Promise.reject(new Error('XLSX engine (ExcelJS) not loaded.'));
        var toBuf = file.arrayBuffer ? file.arrayBuffer()
            : new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(new Error('read error')); }; r.readAsArrayBuffer(file); });
        return toBuf.then(function (buf) {
            var wb = new window.ExcelJS.Workbook();
            return wb.xlsx.load(buf).then(function () {
                var ws = null;
                wb.eachSheet(function (sheet) { if (!ws && sheet.name !== '_SYSTEM') ws = sheet; });
                if (!ws) throw new Error('No data sheet found.');
                var headerRowNo = null, headerVals = null;
                for (var rr = 1; rr <= Math.min(5, ws.rowCount || 5); rr++) {
                    var vals = ws.getRow(rr).values || [];
                    var lowered = vals.map(function (v) { return crcCellText(v).trim().toLowerCase(); });
                    if (lowered.indexOf('row_type') !== -1 || lowered.indexOf('rate_card_id') !== -1) { headerRowNo = rr; headerVals = vals; break; }
                }
                if (!headerRowNo) throw new Error('Header row not found (expected row_type / rate_card_id).');
                var colKeys = [];
                headerVals.forEach(function (h, idx) { if (idx === 0) return; colKeys[idx] = crcCellText(h).trim(); });
                var rows = [];
                for (var rn = headerRowNo + 1; rn <= ws.rowCount; rn++) {
                    var row = ws.getRow(rn); var obj = {}; var any = false;
                    colKeys.forEach(function (key, idx) {
                        if (!key) return;
                        var t = crcCellText(row.getCell(idx).value).trim();
                        obj[key] = t; if (t !== '') any = true;
                    });
                    if (!any) continue;
                    obj.__row = rn;
                    rows.push(obj);
                }
                return { columns: colKeys.filter(Boolean), rows: rows };
            });
        });
    }

    // ---- Update Rate Card modal (unified: carrier selector → download → upload → import) ----
    function updModalPopulateCarriers() {
        var sel = document.getElementById('crcUpdCarrier');
        if (!sel) return;
        var carriers = getCarriers();   // F1-7J-A3: scoped read-model (canonical) / broad getter (Legacy)
        var cur = sel.value;
        var opts = carriers.filter(function (c) { return c.carrierId; })
            .map(function (c) { return { id: c.carrierId, label: c.carrierName || c.carrierId }; })
            .sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); });
        sel.innerHTML = '<option value="">Select carrier…</option>' +
            opts.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.label) + '</option>'; }).join('');
        // Prefill from the page filter when present.
        var pageCarrier = _crcSingleCarrier();
        sel.value = cur || pageCarrier || '';
    }
    function openUpdateModal() {
        if (!useDb()) { alert('Enable the cloud DB to update Carrier Rate Cards.'); return; }
        var m = document.getElementById('crc-update-modal');
        if (!m) return;
        updModalPopulateCarriers();
        var f = document.getElementById('crcUpdFile'); if (f) f.value = '';
        m.style.display = '';
    }
    function closeUpdateModal() { var m = document.getElementById('crc-update-modal'); if (m) m.style.display = 'none'; }
    function modalDownloadUpdate() {
        var sel = document.getElementById('crcUpdCarrier');
        var carrierId = sel ? sel.value : '';
        if (!carrierId) { alert('Please select a carrier before downloading the Update Template.'); return; }
        exportUpdateTemplateXlsx(carrierId);
    }
    function modalImport() {
        var sel = document.getElementById('crcUpdCarrier');
        var carrierId = sel ? sel.value : '';
        var input = document.getElementById('crcUpdFile');
        if (!input || !input.files || !input.files[0]) { alert('Choose a file to import.'); return; }
        crcImportFile(input.files[0], carrierId);
    }

    // ---- Master Template modal (unified: download full editable XLSX → upload → import, master mode) ----
    function openMasterModal() {
        if (!useDb()) { alert('Enable the cloud DB to use the Carrier Master Template.'); return; }
        var m = document.getElementById('crc-master-modal');
        if (!m) return;
        var f = document.getElementById('crcMasterFile'); if (f) f.value = '';
        m.style.display = '';
    }
    function closeMasterModal() { var m = document.getElementById('crc-master-modal'); if (m) m.style.display = 'none'; }
    function modalDownloadMaster() { exportMasterTemplateXlsx(); }
    function modalImportMaster() {
        var input = document.getElementById('crcMasterFile');
        if (!input || !input.files || !input.files[0]) { alert('Choose a file to import.'); return; }
        crcImportFile(input.files[0], '', 'master');   // no carrier scope; force master mode
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
    // F1 — Date-range picker
    window.crcOpenDateModal = openDateModal;
    window.crcCloseDateModal = closeDateModal;
    window.crcDateApply = dateApply;
    window.crcDateClear = dateClear;
    window.crcPresetClick = presetClick;
    window.crcCalNav = calNav;
    // F6 — faceted filter change (kept for compat) + the multi-select checkbox filter widget handlers.
    window.crcOnFilterChange = onFilterChange;
    window.crcToggleFilterPanel = crcToggleFilterPanel;
    window.crcOnFilterToggle = crcOnFilterToggle;
    window.crcFilterSelectAll = crcFilterSelectAll;
    window.crcFilterClear = crcFilterClear;
    window.crcOnFilterOptionSearch = crcOnFilterOptionSearch;

    // Outside-click / Esc close the open filter panel (bound once; null-safe by id lookup).
    document.addEventListener('click', function (e) {
        if (e.target && e.target.closest && !e.target.closest('.crcf-multi')) _crcCloseFilterPanels();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _crcCloseFilterPanels(); });
    window.crcExportUpdateTemplate = exportUpdateTemplate;
    window.crcExportMasterTemplate = exportMasterTemplate;
    window.crcExportTemplate = exportUpdateTemplate;   // back-compat alias (old single-button handler)
    window.crcExportUpdateTemplateXlsx = exportUpdateTemplateXlsx;   // Phase 2 — formatted XLSX (TEMPLATE_UI_STANDARD)
    window.crcExportMasterTemplateXlsx = exportMasterTemplateXlsx;
    // Update Rate Card modal (unified user-facing workflow)
    window.crcOpenUpdateModal = openUpdateModal;
    window.crcCloseUpdateModal = closeUpdateModal;
    window.crcModalDownloadUpdate = modalDownloadUpdate;
    window.crcModalImport = modalImport;
    // Master Template modal (unified download + upload + import; master mode)
    window.crcOpenMasterModal = openMasterModal;
    window.crcCloseMasterModal = closeMasterModal;
    window.crcModalDownloadMaster = modalDownloadMaster;
    window.crcModalImportMaster = modalImportMaster;
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
