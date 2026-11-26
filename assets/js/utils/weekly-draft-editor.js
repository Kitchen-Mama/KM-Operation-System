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
    function groupsFrom(lines) {
        var core=window.KM.mixedCartons, byId={}, groups={};
        lines.forEach(function(l){var m=core.metadata((l.raw||l).note);if(m){byId[m.ref]=l.sku;m.groups.forEach(function(g){groups[g.id]=g;});}});
        return Object.keys(groups).sort().map(function(k){var g=groups[k];return {id:g.id,representative_sku:byId[g.representativeId],members:g.members.map(function(m){return {sku:byId[m.lineId],quantity:m.quantity};})};});
    }
    function checkGroups(rows, groups) {
        var available={},used={};rows.filter(function(r){return !r.removed;}).forEach(function(r){available[r.sku]=qty(r.quantity,!!r.id===false);});
        groups.forEach(function(g){var seen={};if(g.members.length<2)throw Error('Each mixed carton needs at least two SKUs.');
            g.members.forEach(function(m){if(!Object.prototype.hasOwnProperty.call(available,m.sku)||seen[m.sku])throw Error('Choose distinct shipping SKUs in each carton.');seen[m.sku]=true;
                m.quantity=qty(m.quantity,true);used[m.sku]=(used[m.sku]||0)+m.quantity;if(used[m.sku]>available[m.sku])throw Error(m.sku+': mixed-carton quantity exceeds shipping quantity.');});
            if(!seen[g.representative_sku])throw Error('Representative SKU must belong to this carton.');
        });return groups;
    }
    function syncAdditional(rows,groups,previous) {
        var totals={};groups.filter(function(g){return g.additional;}).forEach(function(g){g.members.forEach(function(m){var n=Number(m.quantity);if(m.sku&&Number.isFinite(n)&&n>0)totals[m.sku]=(totals[m.sku]||0)+n;});});
        Object.keys(totals).forEach(function(sku){var r=rows.find(function(x){return x.sku===sku;});if(!r){r={sku:sku,quantity:0,autoAdded:true};rows.push(r);}if(r.removed){r.quantity=0;r.removed=false;}});
        rows.forEach(function(r){r.quantity=Number(r.quantity)+(totals[r.sku]||0)-((previous||{})[r.sku]||0);if(r.autoAdded&&r.quantity===0)r.removed=true;});return totals;
    }
    function packingPayload(groups){return groups.map(function(g){return {id:g.id,representative_sku:g.representative_sku,members:g.members.map(function(m){return {sku:m.sku,quantity:m.quantity};})};});}
    function error(r) { var e = r && r.error, issues=(r&&r.issues)||(e&&e.details&&e.details.issues)||[], specific=issues.find(function(i){return /^(WEEKLY_STOCK_|MIXED_)/.test(s(i.code));}); return { code:s((e && e.code) || (r && r.code) || 'NO_RESULT'), message:s(specific&&(specific.message+' ['+specific.code+']') || (e && e.message) || (typeof e === 'string' ? e : '') || 'No confirmed result.') }; }
    function freezeOnError(code) { return !/^(IMPORT_VALIDATION_FAILED|WEEKLY_LINES_VALIDATION_FAILED|IMPORT_REQUEST_INVALID|IMPORT_PREVIEW_STALE|IMPORT_FAILED_ROLLED_BACK|LOCK_UNAVAILABLE|IN_FLIGHT)$/.test(code); }
    function close() {
        if (!active || active.busy) return;
        active.dialog.close(); active.dialog.remove(); active = null;
    }
    function open(opts) {
        if (active) { active.dialog.focus(); return Promise.resolve(); }
        if (!opts.plan || opts.plan.status !== 'draft' || !opts.token) return Promise.reject(Error('Reject to Draft and reload before editing.'));
        var environment = env(); if (!known(environment)) return Promise.reject(Error('Environment unavailable. Reload before editing.'));
        if (!window.KM.mixedCartons) return Promise.reject(Error('Packing module unavailable. Reload before editing.'));
        var st = { opts:opts, environment:environment, rows:(opts.lines || []).map(function (l) {
            return { id:l.shippingPlanLineId, sku:l.sku, original:l.approvedQty, quantity:opts.values[l.shippingPlanLineId] === undefined ? l.approvedQty : opts.values[l.shippingPlanLineId], token:s((l.raw || {}).updated_at) };
        }), busy:false, frozen:false, loaded:false, catalog:[], sent:null, signature:'', groups:groupsFrom(opts.lines||[]) };
        st.hadPacking=st.groups.length>0;st.extraTotals={};
        var d = document.createElement('dialog'); d.className = 'sp-sku-editor'; d.setAttribute('aria-label','Edit Draft SKUs');
        d.innerHTML = '<header><h3>Edit Draft SKUs</h3><button type="button" data-close title="Close" aria-label="Close">&#215;</button></header>' +
            '<div class="sp-sku-editor__scope">' + esc(opts.plan.company) + ' / ' + esc(opts.plan.country) + ' / ' + esc(opts.plan.marketplace) + '</div>' +
            '<div class="sp-sku-editor__table"><table><thead><tr><th>SKU</th><th>Quantity</th><th></th></tr></thead><tbody></tbody></table></div>' +
            '<div class="sp-sku-editor__add"><select aria-label="SKU to add"><option value="">Loading SKUs...</option></select><button type="button" data-add title="Add SKU" aria-label="Add SKU">+</button></div>' +
            '<section class="sp-packing-editor"><div class="sp-packing-editor__heading"><label><input type="checkbox" data-mixed> Mixed cartons / &#25340;&#31665;</label><button type="button" data-add-group title="Add mixed carton" aria-label="Add mixed carton">+</button></div><div data-groups></div></section>' +
            '<p role="status" aria-live="polite"></p><footer><button type="button" data-close>Cancel</button><button type="button" data-recheck hidden>Re-check</button><button type="button" data-save disabled>Save</button></footer>';
        st.dialog = d; active = st; document.body.appendChild(d); d.showModal();
        var status = d.querySelector('[role="status"]'), save = d.querySelector('[data-save]'), select = d.querySelector('select'), add = d.querySelector('[data-add]');
        function enabled() { save.disabled = st.busy || st.frozen || !st.loaded; add.disabled = st.busy || st.frozen || !st.loaded; select.disabled = add.disabled; d.querySelectorAll('tbody input,tbody button,.sp-packing-editor input,.sp-packing-editor select,.sp-packing-editor button').forEach(function (e) { e.disabled = st.busy || st.frozen; }); d.querySelector('[data-add-group]').hidden=!d.querySelector('[data-mixed]').checked; d.querySelectorAll('[data-close]').forEach(function (e) { e.disabled = st.busy; }); }
        function paintGroups() {
            var box=d.querySelector('[data-groups]');box.innerHTML='';
            st.groups.forEach(function(g,gi){var f=document.createElement('fieldset');f.innerHTML='<legend>Mixed '+(gi+1)+' / 1 carton</legend><label><input type="checkbox" data-additional> Add extra quantities</label><div class="sp-packing-editor__heading"><label>Representative SKU <select data-rep></select></label><button type="button" data-remove-group title="Remove carton" aria-label="Remove mixed carton '+(gi+1)+'">&#215;</button></div><table><thead><tr><th>SKU</th><th>Pcs in carton</th><th></th></tr></thead><tbody></tbody></table><button type="button" data-member title="Add carton member" aria-label="Add carton member">+</button>';
                var extra=f.querySelector('[data-additional]');extra.checked=!!g.additional;extra.onchange=function(){g.additional=extra.checked;st.extraTotals=syncAdditional(st.rows,st.groups,st.extraTotals);paint();};
                var rep=f.querySelector('[data-rep]');rep.innerHTML='<option value="">Select SKU</option>'+g.members.map(function(m){return '<option value="'+esc(m.sku)+'">'+esc(m.sku)+'</option>';}).join('');rep.value=g.representative_sku||'';rep.onchange=function(){g.representative_sku=rep.value;};
                var choices=st.catalog.slice();st.rows.filter(function(r){return !r.removed;}).forEach(function(r){if(!choices.some(function(c){return c.sku===r.sku;}))choices.push({sku:r.sku});});
                g.members.forEach(function(m,mi){var tr=document.createElement('tr');tr.innerHTML='<td><select aria-label="Mixed '+(gi+1)+' SKU '+(mi+1)+'"><option value="">Select SKU</option>'+choices.map(function(r){return '<option value="'+esc(r.sku)+'">'+esc(r.sku)+'</option>';}).join('')+'</select></td><td><input type="number" min="1" step="1" aria-label="Mixed '+(gi+1)+' quantity '+(mi+1)+'"></td><td><button type="button" title="Remove member" aria-label="Remove carton member">&#215;</button></td>';
                    var sku=tr.querySelector('select'),q=tr.querySelector('input');sku.value=m.sku||'';q.value=m.quantity;sku.onchange=function(){m.sku=sku.value;if(!g.additional&&!st.rows.some(function(r){return r.sku===m.sku&&!r.removed;})){st.rows.push({sku:m.sku,quantity:Number(m.quantity)||1});}st.extraTotals=syncAdditional(st.rows,st.groups,st.extraTotals);paint();};q.oninput=function(){m.quantity=q.value;st.extraTotals=syncAdditional(st.rows,st.groups,st.extraTotals);d.querySelectorAll('.sp-sku-editor__table tbody tr').forEach(function(row,i){row.querySelector('input').value=st.rows[i].quantity;});};tr.querySelector('button').onclick=function(){g.members.splice(mi,1);st.extraTotals=syncAdditional(st.rows,st.groups,st.extraTotals);paint();};f.querySelector('tbody').appendChild(tr);});
                f.querySelector('[data-remove-group]').onclick=function(){st.groups.splice(gi,1);st.extraTotals=syncAdditional(st.rows,st.groups,st.extraTotals);paint();};f.querySelector('[data-member]').onclick=function(){g.members.push({sku:'',quantity:1});paintGroups();enabled();};box.appendChild(f);
            });
        }
        function paint() {
            var tb = d.querySelector('tbody'); tb.innerHTML = '';
            st.rows.forEach(function (r,i) {
                var tr = document.createElement('tr'); tr.className = r.removed ? 'is-removed' : '';
                tr.innerHTML = '<td>' + esc(r.sku) + (r.removed ? ' <small>Removed</small>' : '') + '</td><td><input type="number" min="0" step="1" aria-label="Quantity ' + esc(r.sku) + '"' + (r.removed ? ' hidden' : '') + '></td><td><button type="button" title="' + (r.removed ? 'Restore SKU' : 'Remove SKU') + '" aria-label="' + (r.removed ? 'Restore ' : 'Remove ') + esc(r.sku) + '">' + (r.removed ? '&#8630;' : '&#215;') + '</button></td>';
                var input = tr.querySelector('input'); input.value = r.quantity; input.oninput = function () { r.quantity = input.value; };
                tr.querySelector('button').onclick = function () { if (!st.busy && !st.frozen) { st.rows[i].removed = !st.rows[i].removed; paint(); } }; tb.appendChild(tr);
            });
            var used = {}; st.rows.forEach(function (r) { if (!r.removed) used[r.sku] = true; });
            select.innerHTML = '<option value="">Select SKU</option>' + st.catalog.filter(function (r) { return !used[r.sku]; }).map(function (r) { return '<option value="' + esc(r.sku) + '">' + esc(r.sku + (r.siteSku ? ' / ' + r.siteSku : '')) + '</option>'; }).join(''); paintGroups();enabled();
        }
        d.querySelector('[data-mixed]').checked=st.hadPacking;
        d.querySelector('[data-mixed]').onchange=function(){if(!this.checked){if(st.groups.length&&!window.confirm('Remove all mixed cartons?')){this.checked=true;return;}st.groups=[];st.extraTotals=syncAdditional(st.rows,st.groups,st.extraTotals);}paint();};
        d.querySelector('[data-add-group]').onclick=function(){st.groups.push({id:'MC-'+id(),representative_sku:'',additional:true,members:[{sku:'',quantity:1},{sku:'',quantity:1}]});paintGroups();enabled();};
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
            var ops,packing=st.hadPacking||d.querySelector('[data-mixed]').checked;
            try { ops = edits(st.rows); if(packing){checkGroups(st.rows,st.groups);st.rows.filter(function(r){return r.id&&!r.removed;}).forEach(function(r){if(!ops.some(function(o){return o.shipping_plan_line_id===r.id;}))ops.push({op:'update',shipping_plan_line_id:r.id,quantity:qty(r.quantity,false),expected_updated_at:r.token});});}
                if (!ops.length) { status.textContent = 'No changes.'; return; } } catch (e) { status.textContent = e.message; return; }
            if (st.rows.some(function (r) { return r.id && !r.token; })) { st.frozen = true; status.textContent = 'A line has no version. Reload before editing.'; enabled(); return; }
            var signature = JSON.stringify([ops,packing?st.groups:null]);
            if (!st.sent || st.signature !== signature) { st.signature = signature; st.sent = { shipping_plan_id:opts.plan.shippingPlanId, expected_plan_updated_at:opts.token, request_id:id(), line_edits:ops }; }
            if(packing){st.sent.packing_version=window.KM.mixedCartons.VERSION;st.sent.mixed_cartons=packingPayload(st.groups);}
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
    window.KM.weeklyDraftEditor = { open:open, close:close, _catalog:catalog, _edits:edits, _freezeOnError:freezeOnError, _checkGroups:checkGroups, _syncAdditional:syncAdditional };
})();
