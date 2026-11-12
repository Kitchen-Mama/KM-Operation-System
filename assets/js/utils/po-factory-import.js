(function () {
    'use strict';
    window.KM = window.KM || {};
    var factoryCache = null, factoryFlight = null, FACTORY_TTL = 5 * 60 * 1000;
    function environment() { return window.KM.DB.envId ? String(window.KM.DB.envId() || '') : ''; }
    function copyOptions(rows) { return rows.map(function (r) { return { value: r.value, label: r.label }; }); }
    function factoryOptions() {
        var env = environment();
        if (env && factoryCache && factoryCache.env === env && Date.now() < factoryCache.expires) return Promise.resolve(copyOptions(factoryCache.rows));
        if (env && factoryFlight && factoryFlight.env === env) return factoryFlight.promise.then(copyOptions);
        var flight = { env: env };
        flight.promise = window.KM.DB.importTemplateGet({ domain: 'po_factory_stock', mode: 'NEW_RECEIPT', scope: {} }).then(function (t) {
            if (environment() !== env) throw new Error('Environment changed. Reopen the import.');
            if (!t || !t.success) throw new Error(t && (t.error || t.code) || 'Factory list unavailable');
            var rows = ((t.lists && t.lists.factories) || []).filter(function (f) { return f.status === 'active'; }).map(function (f) { return { value: f.value, label: f.label || f.value }; });
            if (env) factoryCache = { env: env, expires: Date.now() + FACTORY_TTL, rows: copyOptions(rows) };
            return rows;
        }).finally(function () { if (factoryFlight === flight) factoryFlight = null; });
        if (env) factoryFlight = flight;
        return flight.promise.then(copyOptions);
    }
    function batchId(parsed, template) {
        var rows = (parsed.sheets && parsed.sheets.StockPO || []).filter(function (r) { return String(r.row_type || '').trim() !== 'example'; });
        var id = rows.length && String(rows[0].transaction_id || '').trim();
        if (rows.length && rows.every(function (r) { return !String(r.transaction_id || '').trim(); })) {
            if (!window.crypto || !window.crypto.subtle) throw new Error('Secure batch identity is unavailable. Nothing was submitted.');
            var columns = template.sheets.filter(function (s) { return s.name === 'StockPO'; })[0].columns;
            var keys = columns.map(function (c) { return c.key; }).filter(function (k) { return k !== 'transaction_id' && k !== 'row_type'; }).sort();
            var content = rows.map(function (r) { return keys.map(function (k) { return [k, String(r[k] == null ? '' : r[k]).trim()]; }); });
            return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content))).then(function (buf) {
                var generated = 'PFI-auto-' + Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
                rows.forEach(function (r) { r.transaction_id = generated; });
                return generated;
            });
        }
        if (!/^[A-Za-z0-9_-]{8,80}$/.test(id || '') || rows.some(function (r) { return String(r.transaction_id || '').trim() !== id; })) throw new Error('Every row must use the same transaction_id (8-80 letters, digits, - or _). Keep this ID for retries.');
        return id;
    }
    function adapter(options) {
        return {
            domain: 'po_factory_stock', title: 'Import PO and Factory Stock', batchId: batchId,
            combinedWorkflowButtons: true,
            modes: [
                { value: 'NEW_RECEIPT', label: 'New receipt', help: 'Add received units to PO and factory stock.', withData: false },
                { value: 'UPDATE_REMAINING', label: 'Update current data', help: 'Set remaining units; shipped quantities stay unchanged.', withData: true }
            ],
            scopeFields: [
                { key: 'warehouse_id', label: 'Factory', required: true, options: factoryOptions },
                { key: 'as_of_date', label: 'Posting date', type: 'date', required: false }
            ],
            actor: function () { return window.KM.currentUser && window.KM.currentUser.email || ''; },
            onCommitted: function (result) {
                return window.KM.DB.refreshPoFactoryTables().then(function (r) {
                    if (!r || !r.success) throw new Error('Readback unavailable. Do not import again.');
                    return options && options.onCommitted ? options.onCommitted(result) : null;
                });
            }
        };
    }
    function open(options) {
        if (window.KM.importBatch) return window.KM.importBatch.open(adapter(options));
        return window.KM.scriptLoader.load('assets/js/utils/import-batch.js?v=iu4-20261112').then(function (ok) {
            if (!ok || !window.KM.importBatch) throw new Error('Import module unavailable');
            return window.KM.importBatch.open(adapter(options));
        });
    }
    window.KM.poFactoryImport = { open: open, _adapter: adapter, _batchId: batchId };
})();
