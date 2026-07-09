// ============================================================
// Template Export Runtime (Phase 1 — TEMPLATE_UI_STANDARD_SPEC.md)
// Generic, module-agnostic XLSX template builder shared by ALL future import/export
// templates (Carrier / Warehouse Rate / Container Rate / PO / Shipment / Forecast /
// Inventory / Factory / Warehouse ...). NOT carrier-specific.
//
// Implements the Template UI Standard: XLSX (§1), freeze pane (§2), header style +
// auto-filter (§3), editable/locked/required cell colors (§4), sheet protection (§5),
// dropdown data validation (§6), comments (§7), auto width (§8), example row + row_type
// (§9), hidden _SYSTEM sheet (§10), template_id / template_version (§11).
//
// Formatting is UX GUIDANCE ONLY — the Import Job Framework remains the validation
// authority. This module does NOT validate, import, or write any business table.
//
// Depends on ExcelJS (loaded via CDN in index.html as window.ExcelJS). The Template UI
// Standard §Non-Goals defers the XLSX library choice; ExcelJS is used because it is the
// client-side CDN library that can write styles / dropdowns / protection / hidden sheets
// (SheetJS community build cannot). See project-current-state.md.
// ============================================================

(function () {
    'use strict';
    window.KM = window.KM || {};

    // ---- Standard palette (Template UI Standard §3/§4). ARGB (Excel) ----
    var STYLE = {
        headerFill: 'FF2F5496',   // strong header background
        headerFont: 'FFFFFFFF',   // readable header text
        editable:   'FFFFFFFF',   // white
        locked:     'FFF2F2F2',   // light gray
        required:   'FFFFF6D5',   // light yellow (legacy "required" kind — other templates)
        business:   'FFFFF2CC',   // yellow — BUSINESS EDITABLE fields (editable in every mode; NOT "required")
        example:    'FFEFE6FF',   // distinct fill for the example row
        systemKey:  'FFF2F2F2'
    };
    // Extra blank input rows appended so users get dropdowns + coloring when adding new rows.
    var BLANK_INPUT_ROWS = 50;

    function argbFill(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }
    function colLetterCount(n) { return n; }
    function s(v) { return String(v == null ? '' : v); }
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

    function isExcelJsReady() { return !!(window.ExcelJS && window.ExcelJS.Workbook); }

    /**
     * Build + download a formatted XLSX template.
     * spec = {
     *   filename,                       // download name (.xlsx appended if missing)
     *   sheetName,                      // data sheet name (default 'Template')
     *   instructionRow,                 // optional string banner placed on row 1 (header then row 2)
     *   columns: [ { key, header, kind:'editable'|'locked'|'required'|'business',
     *                width?, comment?, dropdown?:[values] } ],
     *                                      // kind 'business' = BUSINESS EDITABLE (yellow, always editable/unlocked
     *                                      //   in BOTH Master and Update modes — NOT "required").
     *   rows: [ { <key>: value, ... } ],   // existing data rows (may be empty)
     *   exampleRow: { <key>: value },      // optional; row_type forced to 'example'
     *   blankInputRows,                    // optional override (default 50)
     *   templateMaxRow,                    // optional — extend the prepared template area (fills + protection +
     *                                      //   dropdowns) down to this absolute row (e.g. 5000). Overrides blankInputRows.
     *   protect,                           // default true — protect sheet, unlock editable cells (Update Template)
     *   masterTemplate,                    // true = Master Template mode (admin master-data maintenance):
     *                                      //   NO worksheet protection, NO locked cells, NO gray "locked" fill —
     *                                      //   every data cell is white + editable. Required (yellow), Header,
     *                                      //   Dropdown, Freeze, Auto-Filter, Auto-Width, Example row and the
     *                                      //   hidden _SYSTEM sheet are all preserved. (Update Template = default.)
     *   system: { template_id, template_name, template_version, module, generated_at,
     *             generated_by, export_mode, source_system, carrier_id?, carrier_name?, notes? }
     * }
     * Returns a Promise. Throws (rejects) if ExcelJS is unavailable so the caller can alert.
     */
    function buildAndDownload(spec) {
        if (!isExcelJsReady()) {
            return Promise.reject(new Error('XLSX engine (ExcelJS) not loaded — cannot export a formatted template.'));
        }
        spec = spec || {};
        var columns = spec.columns || [];
        if (!columns.length) return Promise.reject(new Error('Template spec has no columns.'));

        // Master Template mode (admin master-data maintenance) — no protection, no locked cells, no gray fill.
        var isMaster = spec.masterTemplate === true;

        var wb = new window.ExcelJS.Workbook();
        var sheetName = spec.sheetName || 'Template';
        var hasInstruction = !!s(spec.instructionRow).trim();
        var headerRowNo = hasInstruction ? 2 : 1;   // freeze rows 1..headerRowNo (§2)

        var ws = wb.addWorksheet(sheetName, {
            views: [{ state: 'frozen', xSplit: 0, ySplit: headerRowNo }]
        });

        var ncol = columns.length;

        // (1) Optional instruction row (row 1).
        if (hasInstruction) {
            ws.getRow(1).getCell(1).value = s(spec.instructionRow);
            try { ws.mergeCells(1, 1, 1, ncol); } catch (e) { /* merge best-effort */ }
            var instrCell = ws.getRow(1).getCell(1);
            instrCell.font = { italic: true, color: { argb: 'FF7A5C00' } };
            instrCell.fill = argbFill(STYLE.required);
            instrCell.alignment = { wrapText: true, vertical: 'middle' };
        }

        // (2) Header row (§3): bold, strong fill, readable text.
        var headerRow = ws.getRow(headerRowNo);
        columns.forEach(function (c, i) {
            var cell = headerRow.getCell(i + 1);
            cell.value = c.header || c.key;
            cell.font = { bold: true, color: { argb: STYLE.headerFont } };
            cell.fill = argbFill(STYLE.headerFill);
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
            cell.protection = { locked: !isMaster };   // Master Template: no locked cells

            if (s(c.comment).trim()) cell.note = s(c.comment);
        });
        headerRow.commit && headerRow.commit();

        // (3) Auto-filter on the header row (§3).
        ws.autoFilter = {
            from: { row: headerRowNo, column: 1 },
            to: { row: headerRowNo, column: ncol }
        };

        // ---- Data rows: example row first (§9), then existing rows, then blank input rows ----
        var dataStart = headerRowNo + 1;
        var rowsToWrite = [];
        if (spec.exampleRow) {
            var ex = Object.assign({}, spec.exampleRow); ex.row_type = 'example';
            rowsToWrite.push({ data: ex, kind: 'example' });
        }
        (spec.rows || []).forEach(function (r) {
            var d = Object.assign({}, r); if (d.row_type == null) d.row_type = 'data';
            rowsToWrite.push({ data: d, kind: 'data' });
        });
        var blanks;
        if (spec.templateMaxRow != null) {
            // Extend the prepared template area down to templateMaxRow (business columns get yellow
            // fill + unlocked cells across the whole area). rowsToWrite so far = example + existing.
            var lastRowIfNoBlanks = dataStart + rowsToWrite.length - 1;
            blanks = Math.max(0, spec.templateMaxRow - lastRowIfNoBlanks);
        } else {
            blanks = (spec.blankInputRows != null) ? spec.blankInputRows : BLANK_INPUT_ROWS;
        }
        for (var b = 0; b < blanks; b++) rowsToWrite.push({ data: {}, kind: 'blank' });

        rowsToWrite.forEach(function (rw, ri) {
            var excelRow = ws.getRow(dataStart + ri);
            columns.forEach(function (c, ci) {
                var cell = excelRow.getCell(ci + 1);
                var val = rw.data.hasOwnProperty(c.key) ? rw.data[c.key] : '';
                cell.value = (val === '' || val == null) ? null : val;

                // (4) Fill by field kind; example row gets a distinct fill.
                // 'business' = BUSINESS EDITABLE → yellow in BOTH modes. Master Template: NO gray "locked"
                // fill — locked-kind columns render WHITE/editable. Update Template keeps the gray Locked rule.
                if (rw.kind === 'example') cell.fill = argbFill(STYLE.example);
                else if (c.kind === 'business') cell.fill = argbFill(STYLE.business);
                else if (c.kind === 'required') cell.fill = argbFill(STYLE.required);
                else if (c.kind === 'locked' && !isMaster) cell.fill = argbFill(STYLE.locked);
                else cell.fill = argbFill(STYLE.editable);

                // (5) Protection: Master Template → ALL cells unlocked (no cell protection).
                //     Update Template → editable/required/business cells unlocked; locked + example locked.
                if (isMaster) {
                    cell.protection = { locked: false };
                } else {
                    var unlock = (rw.kind !== 'example') && (c.kind === 'editable' || c.kind === 'required' || c.kind === 'business');
                    cell.protection = { locked: !unlock };
                }

                // (6) Dropdown validation on editable/required enum columns (not the example row).
                if (c.dropdown && c.dropdown.length && rw.kind !== 'example') {
                    var list = '"' + c.dropdown.map(function (v) { return s(v).replace(/"/g, ''); }).join(',') + '"';
                    if (list.length <= 255) {   // Excel inline-list limit
                        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [list], showErrorMessage: false };
                    }
                }
            });
            excelRow.commit && excelRow.commit();
        });

        // (8) Auto width — max(header, sampled values), clamped. Columns flagged { hidden:true } are
        // preserved in the file (data + header written) but hidden from the visible worksheet — used to
        // keep reference/identity fields (e.g. rate_card_id) available for import without showing them.
        columns.forEach(function (c, i) {
            var maxLen = s(c.header || c.key).length;
            rowsToWrite.slice(0, 60).forEach(function (rw) {
                var v = rw.data[c.key]; if (v != null) maxLen = Math.max(maxLen, s(v).length);
            });
            ws.getColumn(i + 1).width = clamp(maxLen + 2, 10, 40);
            if (c.hidden) ws.getColumn(i + 1).hidden = true;
        });

        // (10) Hidden _SYSTEM metadata sheet.
        var sys = spec.system || {};
        var sysWs = wb.addWorksheet('_SYSTEM');
        sysWs.state = 'veryHidden';
        var sysRows = [
            ['template_id', sys.template_id], ['template_name', sys.template_name],
            ['template_version', sys.template_version], ['module', sys.module],
            ['generated_at', sys.generated_at], ['generated_by', sys.generated_by],
            ['export_mode', sys.export_mode], ['source_system', sys.source_system],
            ['carrier_id', sys.carrier_id], ['carrier_name', sys.carrier_name],
            ['notes', sys.notes]
        ];
        sysRows.forEach(function (kv, i) {
            var r = sysWs.getRow(i + 1);
            r.getCell(1).value = kv[0];
            r.getCell(1).font = { bold: true };
            r.getCell(1).fill = argbFill(STYLE.systemKey);
            r.getCell(2).value = (kv[1] == null || kv[1] === '') ? null : kv[1];
        });
        sysWs.getColumn(1).width = 20;
        sysWs.getColumn(2).width = 40;

        // (5) Protect the data sheet (UX only — importer is the authority).
        // Master Template mode NEVER protects the sheet (admin edits everything freely).
        var chain = Promise.resolve();
        if (!isMaster && spec.protect !== false && typeof ws.protect === 'function') {
            chain = Promise.resolve(ws.protect('', {
                selectLockedCells: true, selectUnlockedCells: true,
                formatCells: false, formatColumns: true, formatRows: true,
                insertRows: true, deleteRows: true, sort: true, autoFilter: true
            })).catch(function () { /* protection is best-effort UX */ });
        }

        var filename = s(spec.filename) || ('template_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        if (!/\.xlsx$/i.test(filename)) filename += '.xlsx';

        return chain.then(function () {
            return wb.xlsx.writeBuffer();
        }).then(function (buf) {
            var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = filename; document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            return { filename: filename, rows: rowsToWrite.length, columns: columns.length };
        });
    }

    window.KM.templateExport = {
        buildAndDownload: buildAndDownload,
        isReady: isExcelJsReady,
        STYLE: STYLE
    };
})();
