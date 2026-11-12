(function () {
    'use strict';
    var current = null;
    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function normalizedStatus(v) {
        var s = String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '_');
        if (/^(active|true|1|running_in_the_market)$/.test(s)) return 'active';
        if (/^(inactive|false|0|closure)$/.test(s)) return 'inactive';
        return /^(phasing_out|discontinued)$/.test(s) ? s : '';
    }
    function stopped(v) { return /^(inactive|discontinued)$/.test(normalizedStatus(v)); }
    function environment() { return window.KM && KM.DB && KM.DB.envId ? KM.DB.envId() : ''; }
    async function call(body) {
        if (typeof OP_DB_API_BASE_URL !== 'string' || !OP_DB_API_BASE_URL || typeof _kmFetchBounded_ !== 'function') throw Error('Connection unavailable.');
        var r = await _kmFetchBounded_(OP_DB_API_BASE_URL, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }, body.action === 'siteSku.planning.list' ? 'read' : 'write');
        if (!r.ok) throw Error('Request did not finish.');
        return r.json();
    }
    function close() { if (!current || current.busy) return; current.dialog.close(); current.dialog.remove(); current = null; }
    async function open() {
        if (current) { current.dialog.focus(); return; }
        var mid = typeof _irSearch !== 'undefined' && _irSearch.applied && _irSearch.applied.marketplaceId;
        if (!mid) { alert('Search a site before editing SKUs.'); return; }
        var env = environment(); if (!env || /^env:(unknown|0:0)$/.test(env)) { alert('Reload before editing.'); return; }
        var d = document.createElement('dialog'); d.className = 'sp-sku-editor si-sku-editor'; d.setAttribute('aria-label', 'Edit Site SKU');
        d.innerHTML = '<header><h3>Edit Site SKU</h3><button type="button" data-close aria-label="Close" title="Close">&#215;</button></header><div class="si-sku-fields"><label>SKU<select data-sku disabled><option>Loading...</option></select></label><label>Planning model<select data-model disabled><option value="sales_driven">Sales Driven</option><option value="forecast_driven">Forecast Driven</option></select></label><label>Sales status<select data-status disabled><option value="selling">Selling</option><option value="stopped">Discontinued</option></select></label></div><p role="status" aria-live="polite">Loading...</p><footer><button type="button" data-cancel>Cancel</button><button type="button" data-save disabled>Save</button></footer>';
        document.body.appendChild(d); var st = current = { dialog: d, busy: false, frozen: false, rows: [], env: env, mid: mid };
        var sku = d.querySelector('[data-sku]'), model = d.querySelector('[data-model]'), status = d.querySelector('[data-status]'), message = d.querySelector('[role=status]'), save = d.querySelector('[data-save]');
        function match() { return st.rows.filter(function (r) { return r.id === sku.value; })[0]; }
        function changed() { var r = match(); if (!r) return; model.value = r.model; status.value = normalizedStatus(r.status) ? (stopped(r.status) ? 'stopped' : 'selling') : ''; save.disabled = !/^(sales_driven|forecast_driven)$/.test(r.model) || !status.value; message.textContent = status.value ? '' : 'Choose the sales status before saving.'; }
        status.onchange = function () { save.disabled = st.busy || st.frozen || !status.value || !model.value; };
        model.onchange = status.onchange;
        d.querySelector('[data-close]').onclick = close; d.querySelector('[data-cancel]').onclick = close; d.addEventListener('cancel', function (e) { if (st.busy) e.preventDefault(); else close(); }); sku.onchange = changed;
        save.onclick = async function () {
            if (st.busy || st.frozen || environment() !== st.env || _irSearch.applied.marketplaceId !== st.mid) { message.textContent = 'Site changed. Close and reload before editing.'; return; }
            var row = match(); if (!row) return;
            if (!/^(selling|stopped)$/.test(status.value) || !/^(sales_driven|forecast_driven)$/.test(model.value)) { message.textContent = 'Choose a planning model and sales status.'; return; }
            var priorStatus = normalizedStatus(row.status);
            var nextStatus = priorStatus && stopped(priorStatus) === (status.value === 'stopped') ? priorStatus : (status.value === 'stopped' ? 'inactive' : 'active');
            st.busy = true; save.disabled = true; sku.disabled = model.disabled = status.disabled = true; message.textContent = 'Saving...';
            try {
                var result = await call({ action: 'siteSku.planning.update', marketplace_id: st.mid, marketplace_sku_id: row.id, expected_revision: row.revision, replenishment_model: model.value, marketplace_sku_status: nextStatus });
                if (!result || result.success !== true) { st.frozen = true; message.textContent = 'Not confirmed (' + String(result && result.code || 'NO_RESULT') + '). Close and reload; do not resend.'; return; }
                if (environment() !== st.env || _irSearch.applied.marketplaceId !== st.mid) { st.frozen = true; message.textContent = 'Saved. Site changed; reload the original site.'; return; }
                message.textContent = 'Saved. Reading back...';
                if (typeof _irEffectiveWorkspace === 'function' && _irEffectiveWorkspace()) {
                    await _irWorkspaceRefresh_({ owner: 'POST_WRITE_READBACK', reason: 'Site SKU settings saved' });
                } else if (window.KM.DB.loadOperationDb) await window.KM.DB.loadOperationDb();
                else throw Error('Readback unavailable');
                if (environment() !== st.env || _irSearch.applied.marketplaceId !== st.mid) throw Error('Site changed');
                renderReplenishment(); st.busy = false; close();
            } catch (e) { st.frozen = true; message.textContent = 'Result needs checking. Close and reload; do not resend.'; }
            finally { st.busy = false; save.disabled = true; }
        };
        d.showModal();
        try {
            var response = await call({ action: 'siteSku.planning.list', marketplace_id: mid });
            if (current !== st || !d.open) return;
            if (environment() !== env || _irSearch.applied.marketplaceId !== mid) throw Error('Site changed');
            if (!response || !response.success || !response.data || response.data.marketplace_id !== mid || !Array.isArray(response.data.rows)) throw Error('Read failed');
            st.rows = response.data.rows; sku.innerHTML = st.rows.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.sku) + (stopped(r.status) ? ' (discontinued)' : '') + '</option>'; }).join('');
            if (!st.rows.length) { message.textContent = 'No SKUs registered for this site.'; return; }
            sku.disabled = model.disabled = status.disabled = false; changed();
        } catch (e) { message.textContent = 'Could not load this site. Close and try again.'; }
    }
    window.KM = window.KM || {}; window.KM.siteSkuEditor = { open: open, close: close, stopped: stopped, normalizedStatus: normalizedStatus };
    window.openEditSkuModal = open;
})();
