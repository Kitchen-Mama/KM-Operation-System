(function () {
    'use strict';
    window.KM = window.KM || {};
    var status = 'NOT_LOADED', snapshot = null, flight = null, generation = 0, writes = 0, timer = null, channel = null;
    var listeners = [], freshAt = 0, ageTimer = null, MAX_AGE = 60000, DEADLINE = 30000;
    var lastError = null;   // FE-SI2: WHY the last read failed - a short code for the details view (never a raw server text)
    function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.warn('Factory availability repaint failed.'); } }); }
    function db() { return window.KM && window.KM.DB; }
    function active() {
        var el = document.getElementById('ops-section');
        return !!(el && el.classList.contains('active') && typeof _irSearch !== 'undefined' && _irSearch.applied && _irSearch.applied.marketplaceId);
    }
    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function numeric(v, blankZero) {
        if (v == null || (typeof v === 'string' && v.trim() === '')) return blankZero ? 0 : null;
        var n = Number(v); return isFinite(n) && Math.floor(n) === n ? n : null;
    }
    function fail(message) { throw new Error(message); }
    // Raw factory quantities are checked before the broad API normalizer can turn blanks into zero.
    function validate(stockEnvelope, guardEnvelope) {
        var d = stockEnvelope && stockEnvelope.data, meta = stockEnvelope && stockEnvelope.meta;
        if (!stockEnvelope || stockEnvelope.success !== true || !d || !Array.isArray(d.factory_stock) || !Array.isArray(d.warehouses)) fail('Factory stock unavailable');
        if (!meta || !Array.isArray(meta.onlyRequested) || meta.onlyRequested.slice().sort().join(',') !== 'factory_stock,warehouses' || meta.siteScopeRequested || meta.siteScopeApplied) fail('Factory read scope unverified');
        if (!d.capped || d.capped.factory_stock !== false || d.capped.warehouses !== false || !d.counts || d.counts.factory_stock !== d.factory_stock.length || d.counts.warehouses !== d.warehouses.length) fail('Factory rows incomplete');
        var warehouseById = {};
        d.warehouses.forEach(function (w) { var id = String(w.warehouse_id || '').trim(); if (!id || warehouseById[id]) fail('Warehouse identity ambiguous'); warehouseById[id] = w; });
        function factory(id) { var w = warehouseById[id]; if (!w) fail('Factory source unknown'); return /^(true|yes|1|y)$/i.test(String(w.is_factory_warehouse || '').trim()); }
        var g = guardEnvelope && guardEnvelope.data;
        if (!guardEnvelope || guardEnvelope.success !== true || !g || !Array.isArray(g.pool_keys) || !g.byPool || !g.inventory_snapshot_fingerprint) fail('Factory commitments unavailable');
        var required = ['warehouses','factory_stock','shipping_allocation_drafts','shipping_allocation_draft_lines','shipping_plans','shipping_plan_lines'];
        if (!Array.isArray(g.tables_read) || required.some(function (t) { return g.tables_read.indexOf(t) === -1; })) fail('Factory commitments incomplete');
        var grouped = {}, rows = d.factory_stock.filter(function (r) { return factory(String(r.warehouse_id || '').trim()); }).map(function (r) {
            var wh = String(r.warehouse_id || '').trim(), sku = String(r.sku || '').trim();
            if (!wh || !sku) fail('Factory row identity missing');
            var current = numeric(r.fac_current_stock != null ? r.fac_current_stock : r.current_stock, false);
            var reserved = numeric(r.fac_reserved_stock != null ? r.fac_reserved_stock : r.reserved_stock, true);
            if (current === null || reserved === null || current < 0 || reserved < 0 || reserved > current) fail('Factory balance needs review');
            var key = 'WH:' + wh + '||' + sku, sum = grouped[key] || (grouped[key] = { current: 0, reserved: 0 });
            sum.current += current; sum.reserved += reserved;
            return { warehouseId: wh, sku: sku, currentStock: current, reservedStock: reserved };
        });
        var pools = [];
        g.pool_keys.forEach(function (key) {
            var p = g.byPool[key];
            var inferredWarehouse = p && p.warehouse_id;
            if (!inferredWarehouse && key.indexOf('WH:') === 0) inferredWarehouse = key.slice(3).split('||')[0];
            if (inferredWarehouse && !factory(inferredWarehouse)) return;
            if (!p) fail('Factory pool needs review');
            var raw;
            if (!p.pool_row_found) {
                // FE-SI2 (root cause of "Factory stock update failed", reproduced locally): an active draft / plan on a factory
                // pool that has NO factory_stock row. KMFSG - the authority both ends use - counts a missing row as a zero
                // balance ("a missing row is all-zero rather than an error"), and the server builds the pool exactly so; this
                // check refused it and failed the WHOLE display for every SKU. Accepted only when it is exactly that state:
                // a WH: key with a factory warehouse and a SKU, no stored row in this read, and a zero balance.
                var kp = key.indexOf('WH:') === 0 ? key.slice(3).split('||') : null;
                if (!kp || kp.length !== 2 || !kp[0] || !kp[1] || grouped[key] || p.factory_current_stock !== 0 || p.factory_reserved_stock !== 0) fail('Factory pool needs review');
                var q = {}; for (var pk in p) if (Object.prototype.hasOwnProperty.call(p, pk)) q[pk] = p[pk];
                q.warehouse_id = kp[0]; q.sku = kp[1]; q.factory_stock_row = false; p = q;
                raw = { current: 0, reserved: 0 };
            } else {
                if (!p.warehouse_id || !p.sku) fail('Factory pool needs review');
                raw = grouped['WH:' + p.warehouse_id + '||' + p.sku];
            }
            var names = ['factory_current_stock','factory_reserved_stock','factory_available_stock','active_allocation_draft_qty','active_shipping_plan_qty','already_allocated_qty','available_to_allocate'];
            if (!raw || names.some(function (n) { return numeric(p[n], false) === null; })) fail('Factory pool quantity unknown');
            if (raw.current !== p.factory_current_stock || raw.reserved !== p.factory_reserved_stock || p.factory_available_stock !== raw.current - raw.reserved || p.already_allocated_qty !== p.active_allocation_draft_qty + p.active_shipping_plan_qty || p.available_to_allocate !== p.factory_available_stock - p.already_allocated_qty) fail('Factory snapshot changed');
            pools.push(p);
        });
        // A stored factory row must be present in the guard response: never silently replace it with zero.
        Object.keys(grouped).forEach(function (key) { if (!g.byPool[key]) fail('Factory pool missing from commitments'); });
        return { rows: rows, pools: pools };
    }
    function invalidate() { generation++; status = 'STALE'; snapshot = null; emit(); }
    function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(function () { timer = null; if (active() && !writes) ensure(false); }, 250); }
    function ensure(force) {
        if (writes) return Promise.resolve(null);
        if (flight) return flight;
        if (!force && status === 'READY' && Date.now() - freshAt < MAX_AGE) return Promise.resolve(snapshot);
        if (!force && status === 'FAILED') return Promise.resolve(null);
        var api = db(), my = ++generation, timeout, networkDone = false, raceDone = false;
        status = 'LOADING'; emit();
        var request = Promise.resolve().then(function () {
            if (!api || !api.factoryStockGuardGet) fail('Factory read API unavailable');
            return api.factoryStockGuardGet({ display_snapshot: true });
        }).then(function (res) {
            // FE-SI2: a server refusal carries its own code (e.g. FACTORY_DISPLAY_BALANCE_INVALID, SOURCE_REVISION_PENDING);
            // it used to surface only as "Factory display build unavailable", which named no cause
            if (!res || res.success !== true) { var c = String((res && (res.code || res.error)) || 'NO_RESPONSE'); fail('SERVER:' + (/^[A-Z0-9_:.-]{1,80}$/.test(c) ? c : 'REFUSED')); }
            var projection = res && res.data && res.data.display14;
            if (!projection || projection.display_only !== true || !projection.revision) fail('Factory display build unavailable');
            var checked = validate(projection.stock, res); checked.revision = String(projection.revision); return checked;
        });
        request.then(function () { networkDone = true; if (raceDone) { flight = null; emit(); } }, function () { networkDone = true; if (raceDone) { flight = null; emit(); } });
        var deadline = new Promise(function (_, reject) { timeout = setTimeout(function () { reject(new Error('Factory read timed out')); }, DEADLINE); });
        flight = Promise.race([request, deadline]).then(function (checked) {
            if (generation !== my || writes) return null;
            snapshot = checked; status = 'READY'; freshAt = Date.now(); lastError = null; emit();
            if (ageTimer) clearTimeout(ageTimer);
            // Age changes display freshness, not the source. Reads resume on explicit refresh / focus / page entry.
            ageTimer = setTimeout(function () { if (generation === my && status === 'READY') { status = 'STALE'; emit(); } }, MAX_AGE + 1);
            return checked;
        }).catch(function (e) { if (generation === my) { status = 'FAILED'; lastError = { message: String((e && e.message) || 'Factory read failed').slice(0, 120), at: Date.now() }; emit(); } return null; }).then(function (result) {
            clearTimeout(timeout); raceDone = true;
            if (networkDone) flight = null;
            if (status === 'STALE' && !writes && active()) schedule();
            return result;
        });
        return flight;
    }

    function notifyOthers() { if (channel) { try { channel.postMessage('factory-source-changed'); } catch (e) {} } }
    function observeWriters() {
        var api = db(); if (!api) return;
        ['updateShippingPlanStatus','createShipmentFromPlan','confirmShipmentAndDispatch','cancelShipmentDraft','updateShipment',
         'upsertShippingAllocationDraftAtomic','cancelShippingAllocationDraft','submitAllocationDraftsToShippingPlans','submitShippingAllocationDrafts',
         'updateShippingPlanLineQty','adjustFactoryInventory','factoryInventoryImportCommit','receivePurchaseOrderLines','importCommit'].forEach(function (name) {
            var original = api[name]; if (typeof original !== 'function' || original.__factoryFeedback) return;
            var wrapped = function () {
                writes++; invalidate(); notifyOthers();
                var result;
                function settled() { writes--; invalidate(); notifyOthers(); if (!writes) schedule(); }
                try { result = original.apply(this, arguments); } catch (e) { settled(); throw e; }
                return Promise.resolve(result).then(function (r) { settled(); return r; }, function (e) { settled(); throw e; });
            };
            wrapped.__factoryFeedback = true; api[name] = wrapped;
        });
    }
    function html(sku, warehouses) {
        var message = status === 'FAILED' ? 'Stock update failed. Refresh before planning.' : 'Stock updating...';
        var button = '<button type="button" class="btn btn-primary" style="min-width:84px;min-height:30px" onclick="event.stopPropagation(); KM.factoryAvailability.ensure(true)"' + (status === 'LOADING' || writes || flight ? ' disabled' : '') + '>Refresh</button>';
        var head = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong>Factory availability</strong>' + button + '</div>';
        if (!snapshot) return head + '<p role="status">' + message + '</p>';
        var pools = snapshot.pools.filter(function (p) { return String(p.sku).toUpperCase() === String(sku).toUpperCase(); });
        if (!pools.length) return head + '<p>No factory stock record.</p>';
        var wh = {}; (warehouses || []).forEach(function (w) { wh[w.warehouseId] = w; });
        var body = pools.map(function (p) {
            var w = wh[p.warehouse_id] || {}, name = (w.country ? w.country + ' / ' : '') + (w.warehouseName || w.warehouseCode || 'Factory');
            return '<tr><td>' + esc(name) + '</td>' + ['factory_current_stock','factory_reserved_stock','active_allocation_draft_qty','active_shipping_plan_qty','available_to_allocate'].map(function (n) { return '<td style="text-align:right;padding:6px;white-space:nowrap;' + (n === 'available_to_allocate' && p[n] < 0 ? 'color:#b91c1c;' : '') + '">' + esc(p[n]) + (n === 'factory_current_stock' && p.factory_stock_row === false ? ' (no stock row)' : '') + '</td>'; }).join('') + '</tr>';
        }).join('');
        return head + '<div style="overflow-x:auto;margin-top:8px"><table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr>' + ['Factory','On hand','Reserved','Drafts','Plans','Free to plan'].map(function (s) { return '<th style="padding:6px;text-align:left;white-space:nowrap">' + s + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table></div><small>Last checked ' + esc(new Date(freshAt).toLocaleTimeString()) + (status === 'READY' ? '' : (status === 'LOADING' ? ' · Updating...' : ' · Refresh before planning.')) + '</small>';
    }
    window.KM.factoryAvailability = { ensure: ensure, invalidate: invalidate, status: function () { return status; },
        rows: function () { return status === 'READY' && snapshot && Date.now() - freshAt < MAX_AGE ? snapshot.rows : null; }, html: html,
        lastError: function () { return lastError; }, revision: function () { return status === 'READY' && snapshot ? (snapshot.revision || '') : ''; },
        subscribe: function (fn) { if (listeners.indexOf(fn) < 0) listeners.push(fn); }, observeWriters: observeWriters, validate: validate,
        // R15C-UI: READ-ONLY copies of the validated pools of one SKU (null unless READY) and the time they were read - for the Weekly
        // per-plan summary. Same snapshot, same numbers as html(); nothing here reads, validates or computes anything new.
        poolsFor: function (sku) { if (status !== 'READY' || !snapshot) return null; var u = String(sku == null ? '' : sku).toUpperCase(); return snapshot.pools.filter(function (p) { return String(p.sku).toUpperCase() === u; }).map(function (p) { var q = {}; for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) q[k] = p[k]; return q; }); },
        freshAt: function () { return status === 'READY' && snapshot ? freshAt : 0; } };
    // Display-only accessors never supply the allocation / Submit authority returned by rows().
    window.KM.factoryAvailability.displayAt = function () { return snapshot ? freshAt : 0; };
    window.KM.factoryAvailability.displayPoolsFor = function (sku) {
        if (!snapshot) return null;
        return snapshot.pools.filter(function (p) { return String(p.sku).toUpperCase() === String(sku).toUpperCase(); })
            .map(function (p) { var q = {}; Object.keys(p).forEach(function (k) { q[k] = p[k]; }); return q; });
    };
    observeWriters();
    if (typeof BroadcastChannel === 'function') { try { channel = new BroadcastChannel('km-factory-feedback-v1'); channel.onmessage = function (e) { if (e.data === 'factory-source-changed') { invalidate(); schedule(); } }; } catch (e) {} }
    window.addEventListener('focus', function () { if (active()) ensure(false); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && active()) ensure(false); });
})();
