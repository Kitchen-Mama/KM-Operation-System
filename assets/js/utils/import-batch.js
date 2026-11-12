// ============================================================
// KM.importBatch — R3-IMPORT (2026-10-29, LOCAL CANDIDATE, NOT APPROVED)
// The ONE import modal of the XLSX batch importers (Purchase Order / Shipment / Factory + Overseas Inventory), on the
// shared server framework (78_: import.template.get / validate / commit / receipt.get / history.list).
// Flow: choose mode -> download a blank template or export the scope's current data -> upload -> server validation ->
// per-row preview (create / update / unchanged / reject, issues by sheet / row / column) -> explicit confirmation ->
// commit -> result + the page's own readback -> History. The visuals follow the Factory / Overseas import modal.
//
// RULES the UI keeps (the server enforces them again):
//   - the batch id is made when a file is chosen and kept for that file: validate, commit and any retry reuse it, so a
//     lost response can be resent safely (the server answers a committed batch from its receipt); another file -> a new id
//   - a COMMITTED result disables Apply: Done never resends; UNKNOWN outcomes are held (no retry button), with the receipt
//   - formulas and Excel error cells are sent as their text so the server names them (nothing is evaluated here); the
//     example row (row_type = example) and wholly blank rows are skipped; a dropdown cell "ID | label" sends the ID
//   - a file over MAX_FILE_BYTES is refused before it is parsed
// adapter = { domain, title, modes:[{ value, label, help }], scope():{...}, scopeLabel(vals):string, actor():string,
//             scopeFields?:[{ key, label, options:[{ value, label }], required }] (chosen in the modal; nothing can be downloaded or
//             uploaded before every required one is chosen; another choice drops the file read so far),
//             onCommitted(result) (the page's readback), previewColumns?(row) }
// Depends on KM.DB.import* (operation-system-db-api.js) and KM.templateExport + ExcelJS for the files.
// ============================================================
(function () {
    'use strict';
    window.KM = window.KM || {};
    var MAX_FILE_BYTES = 10 * 1024 * 1024, ID_SEP = ' | ';
    var state = null;

    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function el(id) { return document.getElementById(id); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function stamp(d) { d = d || new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
    function newBatchId(domain) { var r = Math.random().toString(36).slice(2, 8).toUpperCase(); return 'IMB-' + String(domain).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) + '-' + stamp() + '-' + r; }

    function injectStyle() {
        if (el('km-imb-style')) return;
        var st = document.createElement('style'); st.id = 'km-imb-style';
        st.textContent = [
            '.km-imb-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:2000}',
            '.km-imb-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2010;width:min(980px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:10px;box-shadow:0 12px 40px rgba(15,23,42,.25);padding:20px 22px;box-sizing:border-box;font-size:13px;color:#1f2937}',
            '.km-imb-modal h3{margin:0 0 6px;font-size:16px}',
            '.km-imb-scope{font-size:12px;color:#475569;margin:0 0 12px;line-height:1.5;word-break:break-word}',
            '.km-imb-tabs{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap}',
            '.km-imb-tab{border:1px solid #CBD5E1;background:#F8FAFC;color:#334155;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px}',
            '.km-imb-tab[aria-selected="true"]{background:#0080bb;color:#fff;border-color:#0080bb}',
            '.km-imb-modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:0 0 12px}',
            '.km-imb-mode{border:1px solid #CBD5E1;border-radius:8px;padding:10px;cursor:pointer;display:block}',
            '.km-imb-mode input{margin-right:6px}',
            '.km-imb-mode.is-on{border-color:#0080bb;box-shadow:0 0 0 2px rgba(0,128,187,.15)}',
            '.km-imb-mode small{display:block;color:#475569;margin-top:4px;line-height:1.4}',
            '.km-imb-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 10px}',
            '.km-imb-note{font-size:12px;color:#475569;line-height:1.5;margin:0 0 8px}',
            '.km-imb-counts{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}',
            '.km-imb-badge{border-radius:999px;padding:2px 10px;font-size:12px;border:1px solid #E2E8F0;background:#F8FAFC}',
            '.km-imb-badge--create{border-color:#16A34A;color:#166534}.km-imb-badge--update{border-color:#2563EB;color:#1e40af}',
            '.km-imb-badge--unchanged{border-color:#94A3B8;color:#334155}.km-imb-badge--reject{border-color:#DC2626;color:#991b1b}',
            '.km-imb-wrap{max-height:320px;overflow:auto;border:1px solid #E2E8F0;border-radius:8px;margin:8px 0}',
            '.km-imb-table{width:100%;border-collapse:collapse;font-size:11.5px}',
            '.km-imb-table th,.km-imb-table td{padding:4px 8px;border-bottom:1px solid #F1F5F9;text-align:left;vertical-align:top}',
            '.km-imb-table th{position:sticky;top:0;background:#F8FAFC;color:#334155;font-weight:600;z-index:1}',
            '.km-imb-table td{color:#1f2937;background:#fff}',
            '.km-imb-table tr.st-create td:first-child{border-left:3px solid #16A34A}.km-imb-table tr.st-update td:first-child{border-left:3px solid #2563EB}',
            '.km-imb-table tr.st-unchanged td:first-child{border-left:3px solid #94A3B8}.km-imb-table tr.st-reject td:first-child{border-left:3px solid #DC2626}',
            '.km-imb-issues{color:#991b1b}',
            '.km-imb-status{border-radius:8px;padding:8px 10px;margin:8px 0;font-size:12px;line-height:1.5}',
            '.km-imb-status--ok{background:#F0FDF4;border:1px solid #BBF7D0;color:#166534}',
            '.km-imb-status--warn{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E}',
            '.km-imb-status--bad{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B}',
            '.km-imb-status--info{background:#F8FAFC;border:1px solid #E2E8F0;color:#334155}',
            '.km-imb-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap}',
            '.km-imb-modal button[disabled]{opacity:.5;cursor:not-allowed}',
            '@media (max-width:420px){.km-imb-modal{padding:14px 12px}.km-imb-actions .btn{flex:1 1 auto}}'
        ].join('\n');
        document.head.appendChild(st);
    }

    // ---- XLSX parse (ExcelJS) - template columns are the map from header text to key ----
    function cellValue(c) {
        var v = c && c.value;
        if (v == null) return '';
        if (v instanceof Date) return v.getUTCFullYear() + '-' + pad(v.getUTCMonth() + 1) + '-' + pad(v.getUTCDate());
        if (typeof v === 'object') {
            if (v.formula != null || v.sharedFormula != null) return '=' + String(v.formula || v.sharedFormula);   // sent as text: the server names it
            if (v.error) return String(v.error);
            if (Array.isArray(v.richText)) return v.richText.map(function (t) { return t.text; }).join('');
            if (v.text != null) return String(v.text);
            if (v.result != null) return v.result;
            return '';
        }
        return v;
    }
    function parseWorkbook(buf, template) {
        var wb = new window.ExcelJS.Workbook();
        return wb.xlsx.load(buf).then(function () {
            var out = { sheets: {}, problems: [] };
            (template.sheets || []).forEach(function (ts) {
                var ws = wb.getWorksheet(ts.name);
                if (!ws) { out.problems.push('The file has no sheet "' + ts.name + '" - download a new template.'); return; }
                var byHeader = {}, lists = {}, dateKey = {};
                (ts.columns || []).forEach(function (c) { byHeader[String(c.header || c.key).trim()] = c.key; byHeader[c.key] = c.key; if (c.list && template.lists && template.lists[c.list]) lists[c.key] = template.lists[c.list]; if (c.type === 'date') dateKey[c.key] = 1; });
                var headerRow = 0, keys = {};
                for (var r = 1; r <= Math.min(5, ws.rowCount); r++) {
                    var hits = 0, k = {};
                    ws.getRow(r).eachCell({ includeEmpty: false }, function (cell, col) { var t = String(cellValue(cell)).trim(); if (byHeader[t]) { hits++; k[col] = byHeader[t]; } });
                    if (hits >= Math.max(1, Math.ceil((ts.columns || []).length / 2))) { headerRow = r; keys = k; break; }
                }
                if (!headerRow) { out.problems.push('Sheet "' + ts.name + '": the header row was not found - download a new template.'); return; }
                var rows = [];
                for (var i = headerRow + 1; i <= ws.rowCount; i++) {
                    var o = {}, any = false, row = ws.getRow(i);
                    Object.keys(keys).forEach(function (col) {
                        var key = keys[col], v = cellValue(row.getCell(+col));
                        // R4 (2026-10-29): a DATE column holding a number is a spreadsheet serial day (1900 system, a cell without a date format) -
                        // read as that calendar day, never sent as 45992 (found by the first real ExcelJS run)
                        if (dateKey[key] && typeof v === 'number' && isFinite(v) && v > 0) { var dt = new Date(Math.round((v - 25569) * 864e5)); v = dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate()); }
                        if (lists[key] && typeof v === 'string') { var hit = lists[key].filter(function (it) { return (it.value + ID_SEP + it.label) === v; })[0]; if (hit) v = hit.value; }
                        o[key] = v;
                        if (key !== 'row_type' && v !== '' && v != null) any = true;
                    });
                    if (String(o.row_type || '').toLowerCase() === 'example' || !any) continue;
                    delete o.row_type; o.__row = i; rows.push(o);
                }
                out.sheets[ts.name] = rows;
            });
            return out;
        });
    }

    // ---- template spec from the server's template answer ----
    function exportSpec(t, adapter, mode, withData) {
        var sheets = (t.sheets || []).map(function (ts, k) {
            var hasType = (ts.columns || []).some(function (c) { return c.key === 'row_type'; });   // the example marker, once
            var cols = (hasType ? [] : [{ key: 'row_type', header: 'row_type', kind: 'locked', hidden: true }]).concat((ts.columns || []).map(function (c) {
                var list = c.list && t.lists && t.lists[c.list] ? t.lists[c.list].map(function (it) { return it.label ? it.value + ID_SEP + it.label : it.value; }) : null;
                // R4 (2026-10-29): the cell format follows the server's field type - a date column shows and stores days; an identifier / code /
                // list column is plain TEXT (@), so a value TYPED into it keeps its leading zeros (Excel would make "000123" the number 123)
                var fmt = c.type === 'date' ? 'yyyy-mm-dd' : (c.type === 'text' || c.type === 'enum' || c.type === 'ref') ? '@' : undefined;
                return { key: c.key, header: c.header || c.key, kind: c.kind || 'editable', comment: c.comment || '', hidden: !!c.hidden, dropdown: list, dropdownSource: list ? 'auto' : undefined, numFmt: fmt };
            }));
            return { sheetName: ts.name, instructionRow: (k === 0 ? (t.scope_label ? 'Scope: ' + t.scope_label + ' · ' : '') + (withData ? 'Exported ' + (t.exported_at || '') + ' · ' + JSON.stringify(t.row_counts || {}) + ' rows · ' : '') : '') + (ts.instruction || ''),
                columns: cols, rows: withData ? (ts.rows || []) : [], exampleRow: withData ? null : (ts.example || null), blankInputRows: withData ? 20 : 50 };
        });
        return { filename: adapter.domain + '_' + (withData ? 'update_' : 'new_') + mode.toLowerCase() + '_' + stamp(), sheets: sheets, systemExtra: true,
            system: { template_id: 'KM_IMPORT_' + adapter.domain.toUpperCase(), template_version: t.schema_version, module: adapter.domain, generated_at: t.exported_at, export_mode: withData ? 'UPDATE_EXPORT' : 'BLANK',
                source_system: 'KM Operation System', mode: mode, scope: JSON.stringify(t.scope || {}), notes: (t.notes || []).join(' / ') } };
    }

    // ---- rendering ----
    function counts(c) { c = c || {}; return '<div class="km-imb-counts">' + ['create', 'update', 'unchanged', 'reject'].map(function (k) { return '<span class="km-imb-badge km-imb-badge--' + k + '">' + k + ': ' + (c[k] || 0) + '</span>'; }).join('') + '</div>'; }
    function issuesHtml(list) {
        if (!list || !list.length) return '';
        return '<div class="km-imb-wrap"><table class="km-imb-table"><thead><tr><th>Sheet</th><th>Row</th><th>Column</th><th>Problem</th><th>Value</th></tr></thead><tbody>' +
            list.slice(0, 500).map(function (i) { return '<tr class="st-reject"><td>' + esc(i.sheet || '') + '</td><td>' + esc(i.row || '') + '</td><td>' + esc(i.field || '') + '</td><td class="km-imb-issues">' + esc((i.code || '') + (i.message ? ' — ' + i.message : '')) + '</td><td>' + esc(i.value || '') + '</td></tr>'; }).join('') +
            '</tbody></table></div>' + (list.length > 500 ? '<p class="km-imb-note">' + (list.length - 500) + ' more problems not shown.</p>' : '');
    }
    // the domains describe a preview row their own way; one reading: a key, an action, and either changes (before -> after)
    // or the row's own business fields - every value shown as the server sent it, nothing computed here
    var PREVIEW_META = { row: 1, sheet: 1, key: 1, action: 1, status: 1, entity: 1, id: 1, changes: 1, warnings: 1, mode: 1, __row: 1 };
    function flat(v) { if (v == null || v === '') return '∅'; if (typeof v !== 'object') return String(v); return Object.keys(v).map(function (k) { return k + '=' + flat(v[k]); }).join(', '); }
    function previewHtml(p) {
        var rows = (p && p.rows) || [];
        if (!rows.length) return '';
        return '<div class="km-imb-wrap"><table class="km-imb-table"><thead><tr><th>Sheet</th><th>Row</th><th>Key</th><th>Action</th><th>Changes (before → after) / values</th></tr></thead><tbody>' +
            rows.slice(0, 500).map(function (r) {
                var action = String(r.action || r.status || '').toLowerCase(), key = r.key || r.po_no || [r.warehouse_id, r.sku].filter(Boolean).join(' / ') || r.id || '';
                var ch = Array.isArray(r.changes) && r.changes.length ? r.changes.map(function (c) { return esc(c.field || c.key || c.column || '') + ': ' + esc(flat(c.before)) + ' → ' + esc(flat(c.after)); }).join('<br>')
                    : Object.keys(r).filter(function (k) { return !PREVIEW_META[k] && r[k] !== '' && r[k] != null; }).map(function (k) { return esc(k) + ': ' + esc(flat(r[k])); }).join('<br>');
                var warn = (r.warnings || []).map(function (w) { return esc(typeof w === 'object' ? (w.code || '') + ' ' + (w.message || '') : w); }).join('<br>');
                return '<tr class="st-' + esc(action) + '"><td>' + esc(r.sheet || 'Stock') + '</td><td>' + esc(r.row || '') + '</td><td>' + esc(key) + '</td><td>' + esc(action) + '</td><td>' + (ch || esc(r.note || '')) + (warn ? '<br><span class="km-imb-issues">' + warn + '</span>' : '') + '</td></tr>';
            }).join('') + '</tbody></table></div>' + (rows.length > 500 ? '<p class="km-imb-note">' + (rows.length - 500) + ' more rows not shown.</p>' : '');
    }
    function impactsHtml(p) { var im = p && p.impacts; if (!im) return ''; return '<p class="km-imb-note"><strong>Impact:</strong><br>' + Object.keys(im).map(function (k) { return '<strong>' + esc(k) + '</strong>: ' + esc(flat(im[k])); }).join('<br>') + '</p>'; }
    function setStatus(tone, html) { var s = el('km-imb-status'); if (!s) return; s.className = 'km-imb-status km-imb-status--' + tone; s.innerHTML = html; s.hidden = !html; }
    function setBusy(b, label, actionId, busyText) { state.busy = !!b;
        var controls = document.querySelectorAll('#km-imb-modal button,#km-imb-modal input,#km-imb-modal select');
        if (b) Array.prototype.forEach.call(controls, function (x) { x.dataset.imbWasDisabled = x.disabled ? '1' : '0'; x.disabled = true; });
        else Array.prototype.forEach.call(controls, function (x) { if (x.dataset.imbWasDisabled !== undefined) { x.disabled = x.dataset.imbWasDisabled === '1'; delete x.dataset.imbWasDisabled; } });
        ['km-imb-validate', 'km-imb-apply', 'km-imb-file', 'km-imb-dl-blank', 'km-imb-dl-update'].forEach(function (id) { var x = el(id); if (x) x.disabled = !!b || (id === 'km-imb-apply' && !state.canApply); }); if (label) setStatus('info', esc(label));
        ['km-imb-validate','km-imb-apply','km-imb-dl-blank','km-imb-dl-update','km-imb-check'].forEach(function (id) { var x = el(id); if (!x) return; if (b && id === actionId) { if (!x.dataset.imbText) x.dataset.imbText = x.textContent; x.style.minWidth = Math.max(x.getBoundingClientRect().width, 110) + 'px'; x.style.minHeight = Math.max(x.getBoundingClientRect().height, 30) + 'px'; x.textContent = busyText; x.setAttribute('aria-busy','true'); } else if (!b && x.dataset.imbText) { x.textContent = x.dataset.imbText; delete x.dataset.imbText; x.setAttribute('aria-busy','false'); } });
    }

    function render() {
        var a = state.adapter, m = state.mode;
        var body = '<h3 id="km-imb-title">' + esc(a.title) + '</h3><p class="km-imb-scope" id="km-imb-scope">' + esc(a.scopeLabel ? a.scopeLabel(state.scopeVals) : '') + '</p>' + scopeHtml() +
            '<div class="km-imb-tabs" role="tablist"><button type="button" class="km-imb-tab" role="tab" id="km-imb-tab-import" aria-selected="' + (state.tab === 'import') + '">Import</button><button type="button" class="km-imb-tab" role="tab" id="km-imb-tab-history" aria-selected="' + (state.tab === 'history') + '">History</button></div>';
        if (state.tab === 'history') body += '<div id="km-imb-history"><p class="km-imb-note">Loading…</p></div>';
        else {
            body += '<div class="km-imb-modes" role="radiogroup" aria-label="Import mode">' + a.modes.map(function (md) {
                return '<label class="km-imb-mode' + (m === md.value ? ' is-on' : '') + '"><input type="radio" name="km-imb-mode" value="' + esc(md.value) + '"' + (m === md.value ? ' checked' : '') + (state.committed ? ' disabled' : '') + '><strong>' + esc(md.label) + '</strong><small>' + esc(md.help || '') + '</small></label>';
            }).join('') + '</div>' +
            '<div class="km-imb-row"><button type="button" class="btn btn-secondary" id="km-imb-dl-blank"' + (ready() ? '' : ' disabled') + '>Download blank template</button>' +
            '<button type="button" class="btn btn-secondary" id="km-imb-dl-update"' + (ready() ? '' : ' disabled') + '>Export current data (update file)</button></div>' +
            '<div class="km-imb-row"><label for="km-imb-file" style="font-weight:600">File (.xlsx)</label><input type="file" id="km-imb-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"' + (ready() && !state.committed ? '' : ' disabled') + '>' +
            '<button type="button" class="btn btn-secondary" id="km-imb-validate" disabled>Validate</button></div>' +
            '<p class="km-imb-note" id="km-imb-batch">' + (state.batchId ? 'Batch ' + esc(state.batchId) + (state.fileName ? ' · ' + esc(state.fileName) : '') : 'Choose a mode, then a file.') + '</p>' +
            '<div id="km-imb-status" class="km-imb-status" hidden></div><div id="km-imb-preview"></div>' +
            '<label class="km-imb-note" id="km-imb-confirm-wrap" hidden><input type="checkbox" id="km-imb-confirm"> I reviewed this preview; apply exactly these changes.</label>';
        }
        body += '<div class="km-imb-actions"><button type="button" class="btn btn-secondary" id="km-imb-close">' + (state.committed ? 'Done' : 'Close') + '</button>' +
            (state.tab === 'import' ? '<button type="button" class="btn btn-primary" id="km-imb-apply" disabled>Apply</button>' : '') + '</div>';
        el('km-imb-modal').innerHTML = body;
        wire();
        if (state.tab === 'history') loadHistory();
        else if (state.lastView) { setStatus(state.lastView.tone, state.lastView.html); el('km-imb-preview').innerHTML = state.lastView.preview || ''; if (state.lastView.confirm) el('km-imb-confirm-wrap').hidden = false; }
        if (el('km-imb-validate')) el('km-imb-validate').disabled = !(state.parsed && !state.committed);
        if (el('km-imb-apply')) el('km-imb-apply').disabled = !state.canApply;
    }
    // a scope field: { key, label, type: 'select' (default) | 'date', options: [..] | function -> Promise<[..]>, required, modes: [..] (only then) }
    function scopeFields() { return (state.adapter.scopeFields || []).filter(function (f) { return !f.modes || f.modes.indexOf(state.mode) >= 0; }); }
    function ready() { return !!state.mode && !state.optionsLoading && scopeFields().every(function (f) { return !f.required || !!state.scopeVals[f.key]; }); }
    function scope() {   // only the fields of the chosen mode are sent (a server's scope keys are a whitelist)
        var o = Object.assign({}, state.adapter.scope ? state.adapter.scope() : {});
        scopeFields().forEach(function (f) { if (state.scopeVals[f.key]) o[f.key] = state.scopeVals[f.key]; });
        return o;
    }
    function scopeHtml() {
        if (!scopeFields().length) return '';
        return '<div class="km-imb-row">' + scopeFields().map(function (f) {
            var lab = '<label for="km-imb-scope-' + esc(f.key) + '" style="font-weight:600">' + esc(f.label) + (f.required ? ' *' : '') + '</label>', dis = state.committed ? ' disabled' : '';
            if (f.type === 'date') return lab + '<input type="date" id="km-imb-scope-' + esc(f.key) + '" data-key="' + esc(f.key) + '" value="' + esc(state.scopeVals[f.key] || '') + '"' + dis + '>';
            var opts = state.options[f.key] || [];
            return lab + '<select id="km-imb-scope-' + esc(f.key) + '" data-key="' + esc(f.key) + '"' + dis + '><option value="">' + (state.optionsLoading ? 'Loading…' : (f.required ? 'Select…' : 'All')) + '</option>' +
                opts.map(function (o) { return '<option value="' + esc(o.value) + '"' + (state.scopeVals[f.key] === o.value ? ' selected' : '') + '>' + esc(o.label || o.value) + '</option>'; }).join('') + '</select>';
        }).join('') + '</div>';
    }
    function loadOptions() {   // options given as a function are resolved once (e.g. the server template's authority lists)
        var fs = (state.adapter.scopeFields || []).filter(function (f) { return typeof f.options === 'function'; });
        (state.adapter.scopeFields || []).forEach(function (f) { if (Array.isArray(f.options)) state.options[f.key] = f.options; });
        if (!fs.length) return;
        state.optionsLoading = true;
        var owner = state, failures = [];
        Promise.all(fs.map(function (f) { return Promise.resolve().then(f.options).then(function (o) { if (state === owner) owner.options[f.key] = o || []; }, function () { if (state === owner) { owner.options[f.key] = []; failures.push(f.label || f.key); } }); }))
            .then(function () { if (state !== owner) return; owner.optionsLoading = false; render(); if (failures.length) view('bad', 'Could not load ' + esc(failures.join(', ')) + '. This import may be disabled in this environment. No data was changed.'); });
    }
    function view(tone, html, preview, confirm) { state.lastView = { tone: tone, html: html, preview: preview || '', confirm: !!confirm }; setStatus(tone, html); var p = el('km-imb-preview'); if (p) p.innerHTML = preview || ''; var cw = el('km-imb-confirm-wrap'); if (cw) cw.hidden = !confirm; }

    function wire() {
        el('km-imb-close').onclick = close;
        el('km-imb-tab-import').onclick = function () { if (state.busy) return; state.tab = 'import'; render(); };
        el('km-imb-tab-history').onclick = function () { if (state.busy) return; state.tab = 'history'; render(); };
        if (state.tab !== 'import') return;
        scopeFields().forEach(function (f) { var sel = el('km-imb-scope-' + f.key); if (sel) sel.onchange = function () { if (state.busy || state.uncertain || state.committed) return; state.scopeVals[f.key] = sel.value; resetFile(); render(); }; });   // select or date
        Array.prototype.forEach.call(document.querySelectorAll('input[name="km-imb-mode"]'), function (r) { r.onchange = function () { if (state.busy || state.uncertain || state.committed) return; state.mode = r.value; resetFile(); render(); }; });
        el('km-imb-dl-blank').onclick = function () { download(false); };
        el('km-imb-dl-update').onclick = function () { download(true); };
        el('km-imb-file').onchange = function () { chooseFile(this.files && this.files[0]); };
        el('km-imb-validate').onclick = validate;
        el('km-imb-apply').onclick = apply;
        var cb = el('km-imb-confirm'); if (cb) cb.onchange = function () { state.canApply = !!(!state.busy && !state.uncertain && cb.checked && state.validated && state.validated.valid && !state.committed); el('km-imb-apply').disabled = !state.canApply; };
    }
    function resetFile() { state.parsed = null; state.batchId = ''; state.fileName = ''; state.validated = null; state.canApply = false; state.lastView = null; }

    function templateFor(withData) {
        var a = state.adapter;
        return window.KM.DB.importTemplateGet({ domain: a.domain, mode: state.mode, scope: scope(), include_data: !!withData }).then(function (t) {
            if (!t || t.success === false) throw new Error((t && (t.code ? t.code + ': ' : '') + (t.error || '')) || 'template unavailable');
            return t;
        });
    }
    function download(withData) {
        if (state.busy || !ready()) return;
        setBusy(true, withData ? 'Exporting the current data of this scope…' : 'Preparing the template…', withData ? 'km-imb-dl-update' : 'km-imb-dl-blank', 'Exporting...');
        templateFor(withData).then(function (t) {
            var spec = exportSpec(t, state.adapter, state.mode, withData);
            return window.KM.templateExport.buildAndDownload(spec).then(function (res) {
                setBusy(false);
                view(res.droppedDropdowns ? 'warn' : 'ok', (withData ? 'Exported ' + esc(JSON.stringify(t.row_counts || {})) + ' rows of ' + esc(t.scope_label || 'this scope') + ' at ' + esc(t.exported_at || '') + ' — the complete scope, not the visible page.' : 'Template downloaded.') +
                    (res.droppedDropdowns ? ' Dropdown not added: ' + esc(res.droppedDropdowns.join(', ')) + '.' : ''));
            });
        }).catch(function (e) { setBusy(false); view('bad', 'Could not prepare the file: ' + esc(e && e.message || e) + '. Nothing was changed.'); });
    }
    function chooseFile(f) {
        if (state.busy || state.uncertain) return;
        resetFile();
        if (!f) { render(); return; }
        if (!/\.xlsx$/i.test(f.name)) { view('bad', 'Only .xlsx files exported from this page can be imported.'); return; }
        if (f.size > MAX_FILE_BYTES) { view('bad', 'The file is larger than ' + Math.round(MAX_FILE_BYTES / 1048576) + ' MB — split it. It was not read.'); return; }
        state.batchId = newBatchId(state.adapter.domain); state.fileName = f.name;
        var owner = state;
        setBusy(true, 'Reading ' + f.name + '…');
        Promise.all([f.arrayBuffer(), templateFor(false)]).then(function (r) { state.template = r[1]; return parseWorkbook(r[0], r[1]); }).then(function (p) {
            if (state !== owner) return;
            if (p.problems.length) { setBusy(false); view('bad', p.problems.map(esc).join('<br>')); return; }
            return Promise.resolve(state.adapter.batchId ? state.adapter.batchId(p, state.template) : state.batchId).then(function (id) {
            if (state !== owner) return;
            setBusy(false);
            state.batchId = id; state.parsed = p;
            var n = Object.keys(p.sheets).reduce(function (s, k) { return s + p.sheets[k].length; }, 0);
            render(); view('info', esc(n) + ' data rows read (' + Object.keys(p.sheets).map(function (k) { return esc(k) + ' ' + p.sheets[k].length; }).join(', ') + '). Validate to see the preview — nothing is written yet.');
            el('km-imb-validate').disabled = false;
            });
        }).catch(function (e) { if (state !== owner) return; setBusy(false); view('bad', 'The file could not be read: ' + esc(e && e.message || e)); });
    }
    function payload() {
        var a = state.adapter;
        return { domain: a.domain, mode: state.mode, schema_version: state.template && state.template.schema_version, import_batch_id: state.batchId, scope: scope(), sheets: state.parsed.sheets, file: { name: state.fileName }, actor: a.actor ? a.actor() : '' };
    }
    function validate() {
        if (state.busy || state.uncertain || !state.parsed) return;
        setBusy(true, 'Validating on the server…', 'km-imb-validate', 'Validating...');
        window.KM.DB.importValidate(payload()).then(function (v) {
            setBusy(false); state.validated = v; state.canApply = false;
            if (!v || v.success === false) { view('bad', esc((v && v.code) || 'VALIDATION_FAILED') + ' — ' + esc(v && v.error) + '. Nothing was written.', issuesHtml(v && v.issues)); return; }
            var c = (v.preview && v.preview.counts) || {}, receipt = v.receipt;
            if (receipt && receipt.same_content && receipt.status === 'COMMITTED') {
                state.uncertain = true;
                return checkReceipt(true);
            }
            var head = (v.valid ? 'The file is valid. ' : 'The file has problems — fix them and upload again. ') + 'Batch ' + esc(v.import_batch_id) + '.' +
                (receipt ? (receipt.same_content ? ' This exact batch already has a receipt (' + esc(receipt.status) + ').' : ' This batch id was used with another file — choose the file again to start a new batch.') : '') +
                (v.schema_ready === false ? ' The import receipt tables are not provisioned in this deployment: applying will be refused.' : '');
            view(v.valid ? 'ok' : 'bad', head, counts(c) + impactsHtml(v.preview) + issuesHtml(v.issues) + previewHtml(v.preview), v.valid && !(receipt && !receipt.same_content));
        }).catch(function (e) { setBusy(false); view('bad', 'The server could not be reached (' + esc(e && e.message || e) + '). Nothing was written — validate again.'); });
    }
    function apply() {
        if (state.busy || state.uncertain || !state.canApply || state.committed) return;
        state.canApply = false; setBusy(true, 'Importing...', 'km-imb-apply', 'Importing...');
        var body = Object.assign(payload(), { preview_digest: state.validated.preview_digest });
        Promise.resolve().then(function () { return window.KM.DB.importCommit(body); }).then(function (r) { setBusy(false); result(r); })
            .catch(function (e) {
                setBusy(false); state.uncertain = true;
                view('warn', 'The response was lost (' + esc(e && e.message || e) + '). The batch may or may not be applied. <button type="button" class="btn btn-secondary" id="km-imb-check">Check this batch</button> — resending the same batch is safe: a committed batch is answered from its receipt, never applied twice.');
                var b = el('km-imb-check'); if (b) b.onclick = checkReceipt;
            });
    }
    function checkReceipt(replayed) {
        if (state.busy) return;
        setBusy(true, 'Checking import result...', 'km-imb-check', 'Checking...');
        window.KM.DB.importReceiptGet({ import_batch_id: state.batchId, domain: state.adapter.domain }).then(function (r) {
            setBusy(false);
            if (r && r.success && r.receipt && r.receipt.status === 'COMMITTED') { result({ success: true, status: 'COMMITTED', import_batch_id: state.batchId, result: JSON.parse(r.receipt.result_json || '{}'), from_receipt: true, replayed: replayed === true }); return; }
            if (r && r.code === 'IMPORT_BATCH_NOT_FOUND' && replayed !== true) { state.uncertain = false; state.canApply = true; el('km-imb-apply').disabled = false; view('info', 'No receipt: the batch was not applied. You can apply it again (the same batch id).'); return; }
            receiptRetry('Receipt status: ' + esc(r && r.receipt ? r.receipt.status : (r && r.code) || 'unknown') + '. Nothing is retried automatically.');
        }).catch(function (e) { setBusy(false); receiptRetry('The receipt could not be read (' + esc(e && e.message || e) + ').'); });
        function receiptRetry(message) {
            state.uncertain = true;
            view('warn', message + ' <button type="button" class="btn btn-secondary" id="km-imb-check">Check this batch</button>');
            el('km-imb-check').onclick = function () { checkReceipt(replayed === true); };
        }
    }
    function result(r) {
        if (r && r.success && (r.status === 'COMMITTED' || r.replayed)) {
            state.uncertain = false; state.committed = true; state.canApply = false;
            var c = (r.result && r.result.counts) || {};
            render();
            view('ok', (r.replayed ? 'This batch was already applied — nothing was applied again. ' : 'Applied. ') + 'Batch ' + esc(r.import_batch_id) + ' · ' + esc(r.result && r.result.audit_rows != null ? r.result.audit_rows + ' audit rows' : '') + '. Reading the data back…', counts(c));
            Promise.resolve(state.adapter.onCommitted ? state.adapter.onCommitted(r) : null).then(function () { view('ok', state.lastView.html.replace('Reading the data back…', 'Data read back.'), counts(c)); },
                function (e) { view('warn', state.lastView.html.replace('Reading the data back…', 'The import is applied, but the readback failed (' + esc(e && e.message || e) + ') — reload the page; do not import again.'), counts(c)); });
            return;
        }
        var code = r && r.code;
        if (code === 'IMPORT_PREVIEW_STALE') { view('warn', 'The data changed since this preview (another receipt, shipment or import). Nothing was written — validate again.', counts(r.preview && r.preview.counts)); return; }
        if (code === 'IMPORT_BATCH_OUTCOME_UNKNOWN' || code === 'IMPORT_OUTCOME_UNKNOWN') {
            state.uncertain = true;
            view('warn', 'Import result is unknown. Check this batch before another import. <button type="button" class="btn btn-secondary" id="km-imb-check">Check result</button>');
            var check = el('km-imb-check'); if (check) check.onclick = checkReceipt;
            return;
        }
        if (code === 'IMPORT_FAILED_ROLLED_BACK') { state.canApply = true; el('km-imb-apply').disabled = false; view('warn', 'The import failed and every change was undone: ' + esc(r.error) + ' You may apply the same batch again.'); return; }
        if (code === 'LOCK_UNAVAILABLE') { state.canApply = true; el('km-imb-apply').disabled = false; view('warn', 'Another save is in progress — nothing was written. Apply again in a moment.'); return; }
        view('bad', esc(code || 'IMPORT_FAILED') + ' — ' + esc(r && r.error) + '. Nothing was written.', issuesHtml(r && r.issues));
    }
    function fmtCounts(j) { var c = {}; try { c = JSON.parse(j || '{}'); } catch (e) { return String(j || ''); } return ['create', 'update', 'unchanged', 'reject'].filter(function (k) { return c[k]; }).map(function (k) { return k + ' ' + c[k]; }).join(', ') || 'none'; }
    function loadHistory() {
        window.KM.DB.importHistoryList({ domain: state.adapter.domain, limit: 50 }).then(function (h) {
            var box = el('km-imb-history'); if (!box) return;
            if (!h || h.success === false) { box.innerHTML = '<p class="km-imb-note">History could not be read.</p>'; return; }
            if (h.schema_ready === false) { box.innerHTML = '<p class="km-imb-note">Import receipts are not provisioned in this deployment.</p>'; return; }
            if (!h.batches.length) { box.innerHTML = '<p class="km-imb-note">No imports yet.</p>'; return; }
            box.innerHTML = '<div class="km-imb-wrap"><table class="km-imb-table"><thead><tr><th>Batch</th><th>Mode</th><th>Status</th><th>Rows</th><th>File</th><th>By (unverified)</th><th>When</th></tr></thead><tbody>' +
                h.batches.map(function (b) { return '<tr class="st-' + (b.status === 'COMMITTED' ? 'create' : b.status === 'FAILED_ROLLED_BACK' ? 'unchanged' : 'reject') + '"><td>' + esc(b.import_batch_id) + '</td><td>' + esc(b.mode) + '</td><td>' + esc(b.status) + '</td><td>' + esc(fmtCounts(b.row_counts_json)) + '</td><td>' + esc(b.file_name) + '</td><td>' + esc(b.actor_claimed) + '</td><td>' + esc(b.committed_at || b.updated_at) + '</td></tr>'; }).join('') + '</tbody></table></div>';
        }).catch(function (e) { var box = el('km-imb-history'); if (box) box.innerHTML = '<p class="km-imb-note">History could not be read (' + esc(e && e.message || e) + ').</p>'; });
    }

    function close() {
        if (state && state.busy) return;
        if (state && state.uncertain) return;
        var o = el('km-imb-overlay'), m = el('km-imb-modal');
        if (o) o.parentNode.removeChild(o); if (m) m.parentNode.removeChild(m);
        state = null;
    }
    function open(adapter) {
        if (!adapter || !adapter.domain || !adapter.modes || !adapter.modes.length) throw new Error('KM.importBatch.open: adapter.domain and adapter.modes are required');
        if (state && (state.busy || state.uncertain)) return;
        close(); injectStyle();
        state = { adapter: adapter, mode: '', tab: 'import', busy: false, committed: false, canApply: false, scopeVals: Object.assign({}, adapter.scopeInitial || {}), options: {}, optionsLoading: false };
        var o = document.createElement('div'); o.id = 'km-imb-overlay'; o.className = 'km-imb-overlay'; o.onclick = close;
        var m = document.createElement('div'); m.id = 'km-imb-modal'; m.className = 'km-imb-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'km-imb-title');
        document.body.appendChild(o); document.body.appendChild(m);
        loadOptions();
        render();
        return { close: close };
    }

    window.KM.importBatch = { open: open, close: close, _parseWorkbook: parseWorkbook, _exportSpec: exportSpec, _newBatchId: newBatchId, MAX_FILE_BYTES: MAX_FILE_BYTES };
})();
