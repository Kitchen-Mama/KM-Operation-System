(function () {
    'use strict';
    window.KM = window.KM || {};
    var active = null;
    function s(v) { return String(v == null ? '' : v).trim(); }
    function esc(v) { return s(v).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
    function env() { return window.KM.DB && window.KM.DB.envId ? window.KM.DB.envId() : ''; }
    function known(e) { return e && e !== 'env:unknown' && e !== 'env:0:0'; }
    function qty(v, positive) { var n = s(v) === '' ? NaN : Number(v); if (!Number.isSafeInteger(n) || n < (positive ? 1 : 0)) throw Error('Quantity must be a whole number ' + (positive ? 'above zero.' : 'zero or above.')); return n; }
    function catalog(db, p) {
        var counts = {}, result = [];
        (db.marketplaceSkus || []).forEach(function (r) {
            if (['company','country','marketplace'].some(function (k) { return s(r[k]).toLowerCase() !== s(p[k]).toLowerCase(); })) return;
            var raw = r.raw || {}, status = s(raw.marketplace_sku_status === undefined ? (r.marketplaceSkuStatus || raw.status || raw.product_status || raw.is_active) : raw.marketplace_sku_status).toLowerCase().replace(/\s+/g,'_');
            if (!/^(active|true|1|running_in_the_market)$/.test(status)) return;
            var k = s(r.sku); counts[k] = (counts[k] || 0) + 1; result.push({ sku:k, siteSku:s(r.siteSku) });
        });
        return result.filter(function (r) { return counts[r.sku] === 1; }).sort(function (a,b) { return a.sku.localeCompare(b.sku); });
    }
    function edits(rows) {
        var out = [], used = {};
        rows.forEach(function (r) {
            if (r.removed) { if (r.id) out.push({ op:'remove', shipping_plan_line_id:r.id, expected_updated_at:r.token }); return; }
            if (used[r.sku]) throw Error('SKU already exists: ' + r.sku); used[r.sku] = true;
            var n = qty(r.quantity, !r.id);
            if (!r.id) out.push({ op:'add', sku:r.sku, quantity:n });
            else if (n !== Number(r.original)) out.push({ op:'update', shipping_plan_line_id:r.id, quantity:n, expected_updated_at:r.token });
        }); return out;
    }
    function id() { if (!window.crypto || !window.crypto.getRandomValues) throw Error('Secure request ID unavailable.'); var b = new Uint32Array(4); window.crypto.getRandomValues(b); return 'WDL-' + Array.from(b).map(function (v) { return v.toString(16).padStart(8,'0'); }).join(''); }
    function error(r) { var e = r && r.error, issues=(r&&r.issues)||(e&&e.details&&e.details.issues)||[], stock=issues.find(function(i){return /^WEEKLY_STOCK_/.test(s(i.code));}); return { code:s((e && e.code) || (r && r.code) || 'NO_RESULT'), message:s(stock&&stock.message || (e && e.message) || (typeof e === 'string' ? e : '') || 'No confirmed result.') }; }
    function freezeOnError(code) { return !/^(IMPORT_VALIDATION_FAILED|WEEKLY_LINES_VALIDATION_FAILED|IMPORT_REQUEST_INVALID|IMPORT_PREVIEW_STALE|IMPORT_FAILED_ROLLED_BACK|LOCK_UNAVAILABLE|IN_FLIGHT)$/.test(code); }
    function close() {
        if (!active || active.busy) return;
        active.dialog.close(); active.dialog.remove(); active = null;
    }
    function open(opts) {
        if (active) { active.dialog.focus(); return Promise.resolve(); }
        if (!opts.plan || opts.plan.status !== 'draft' || !opts.token) return Promise.reject(Error('Reject to Draft and reload before editing.'));
        var environment = env(); if (!known(environment)) return Promise.reject(Error('Environment unavailable. Reload before editing.'));
        var st = { opts:opts, environment:environment, rows:(opts.lines || []).map(function (l) {
            return { id:l.shippingPlanLineId, sku:l.sku, original:l.approvedQty, quantity:opts.values[l.shippingPlanLineId] === undefined ? l.approvedQty : opts.values[l.shippingPlanLineId], token:s((l.raw || {}).updated_at) };
        }), busy:false, frozen:false, loaded:false, catalog:[], sent:null, signature:'' };
        var d = document.createElement('dialog'); d.className = 'sp-sku-editor'; d.setAttribute('aria-label','Edit Draft SKUs');
        d.innerHTML = '<header><h3>Edit Draft SKUs</h3><button type="button" data-close title="Close" aria-label="Close">&#215;</button></header>' +
            '<div class="sp-sku-editor__scope">' + esc(opts.plan.company) + ' / ' + esc(opts.plan.country) + ' / ' + esc(opts.plan.marketplace) + '</div>' +
            '<div class="sp-sku-editor__table"><table><thead><tr><th>SKU</th><th>Quantity</th><th></th></tr></thead><tbody></tbody></table></div>' +
            '<div class="sp-sku-editor__add"><select aria-label="SKU to add"><option value="">Loading SKUs...</option></select><button type="button" data-add title="Add SKU" aria-label="Add SKU">+</button></div>' +
            '<p role="status" aria-live="polite"></p><footer><button type="button" data-close>Cancel</button><button type="button" data-recheck hidden>Re-check</button><button type="button" data-save disabled>Save</button></footer>';
        st.dialog = d; active = st; document.body.appendChild(d); d.showModal();
        var status = d.querySelector('[role="status"]'), save = d.querySelector('[data-save]'), select = d.querySelector('select'), add = d.querySelector('[data-add]');
        function enabled() { save.disabled = st.busy || st.frozen || !st.loaded; add.disabled = st.busy || st.frozen || !st.loaded; select.disabled = add.disabled; d.querySelectorAll('tbody input,tbody button').forEach(function (e) { e.disabled = st.busy || st.frozen; }); d.querySelectorAll('[data-close]').forEach(function (e) { e.disabled = st.busy; }); }
        function paint() {
            var tb = d.querySelector('tbody'); tb.innerHTML = '';
            st.rows.forEach(function (r,i) {
                var tr = document.createElement('tr'); tr.className = r.removed ? 'is-removed' : '';
                tr.innerHTML = '<td>' + esc(r.sku) + (r.removed ? ' <small>Removed</small>' : '') + '</td><td><input type="number" min="0" step="1" aria-label="Quantity ' + esc(r.sku) + '"' + (r.removed ? ' hidden' : '') + '></td><td><button type="button" title="' + (r.removed ? 'Restore SKU' : 'Remove SKU') + '" aria-label="' + (r.removed ? 'Restore ' : 'Remove ') + esc(r.sku) + '">' + (r.removed ? '&#8630;' : '&#215;') + '</button></td>';
                var input = tr.querySelector('input'); input.value = r.quantity; input.oninput = function () { r.quantity = input.value; };
                tr.querySelector('button').onclick = function () { if (!st.busy && !st.frozen) { st.rows[i].removed = !st.rows[i].removed; paint(); } }; tb.appendChild(tr);
            });
            var used = {}; st.rows.forEach(function (r) { if (!r.removed) used[r.sku] = true; });
            select.innerHTML = '<option value="">Select SKU</option>' + st.catalog.filter(function (r) { return !used[r.sku]; }).map(function (r) { return '<option value="' + esc(r.sku) + '">' + esc(r.sku + (r.siteSku ? ' / ' + r.siteSku : '')) + '</option>'; }).join(''); enabled();
        }
        d.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = close; });
        d.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
        add.onclick = function () {
            if (st.busy || st.frozen || !select.value) return;
            var sku = select.value, prior = st.rows.find(function (r) { return r.sku === sku; });
            if (prior) prior.removed = false; else st.rows.push({ sku:sku, quantity:1 }); paint();
        };
        d.querySelector('[data-recheck]').onclick = function () {
            if (st.busy) return; st.busy = true; enabled();
            Promise.resolve().then(opts.readback).then(function (rb) { status.textContent = rb && rb.readbackFailed ? 'Readback failed. No request was resent.' : 'Current plans reloaded. Close and review before a new edit. No request was resent.'; }, function () { status.textContent = 'Readback failed. No request was resent.'; })
                .finally(function () { st.busy = false; enabled(); });
        };
        save.onclick = function () {
            if (st.busy || st.frozen || !st.loaded) return;
            if (env() !== st.environment || !known(env())) { st.frozen = true; status.textContent = 'Environment changed. Close and reload.'; enabled(); return; }
            var ops; try { ops = edits(st.rows); if (!ops.length) { status.textContent = 'No changes.'; return; } } catch (e) { status.textContent = e.message; return; }
            if (st.rows.some(function (r) { return r.id && !r.token; })) { st.frozen = true; status.textContent = 'A line has no version. Reload before editing.'; enabled(); return; }
            var signature = JSON.stringify(ops);
            if (!st.sent || st.signature !== signature) { st.signature = signature; st.sent = { shipping_plan_id:opts.plan.shippingPlanId, expected_plan_updated_at:opts.token, request_id:id(), line_edits:ops }; }
            st.busy = true; status.textContent = 'Saving...'; enabled();
            Promise.resolve().then(function () { return opts.save(st.sent); }).then(function (r) {
                if (env() !== st.environment) { st.frozen = true; status.textContent = 'Environment changed. Re-check before another change.'; return; }
                if (!r || !r.success) {
                    var e = error(r); st.frozen = freezeOnError(e.code); status.textContent = e.message + ' [' + e.code + ']';
                    d.querySelector('[data-recheck]').hidden = !st.frozen; return;
                }
                st.frozen = true;
                return Promise.resolve().then(opts.readback).then(function (rb) {
                    if (rb && rb.readbackFailed) { status.textContent = 'Saved; readback failed. Do not submit again.'; d.querySelector('[data-recheck]').hidden = false; }
                    else { st.busy = false; close(); }
                });
            }).catch(function () { st.frozen = true; status.textContent = 'Outcome unknown. No request was resent. Re-check the plan.'; d.querySelector('[data-recheck]').hidden = false; })
                .finally(function () { st.busy = false; if (active === st) enabled(); });
        };
        paint();
        return Promise.resolve().then(function () { return window.KM.DB.loadScopedTables(['marketplace_skus']); }).then(function (db) {
            if (active !== st) return;
            if (env() !== st.environment) throw Error('Environment changed. Close and reload.');
            st.catalog = catalog(db,opts.plan); st.loaded = true; paint(); status.textContent = '';
        }).catch(function (e) { if (active !== st) return; st.frozen = true; status.textContent = e.message || 'SKU list unavailable.'; enabled(); });
    }
    window.KM.weeklyDraftEditor = { open:open, close:close, _catalog:catalog, _edits:edits, _freezeOnError:freezeOnError };
})();
