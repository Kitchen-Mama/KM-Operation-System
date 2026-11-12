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
//
// R3-IMPORT (2026-10-29, local candidate) - three OPT-IN additions; a spec that uses none of them builds the same workbook:
//   - spec.sheets: [ <sheet spec> ] several linked data sheets (e.g. Header + Lines), each { sheetName, instructionRow,
//     columns, rows, exampleRow, blankInputRows, templateMaxRow }; absent -> the one sheet the spec itself describes.
//   - column.dropdownSource: 'inline' (default, today) | 'sheet' | 'auto' (the sheet only over the 255-character inline
//     limit): the list goes to ONE veryHidden sheet (spec.listSheetName, default '_LISTS', created after the data
//     sheets), one column per list, with a workbook defined name KM_LIST_<n>; the cell validates against that range.
//     column.strictDropdown: true -> Excel refuses a value outside the list (the importer still re-validates).
//     An inline list over the limit is no longer dropped silently: it is reported in the result's droppedDropdowns.
//   - spec.systemExtra: true -> every other key of spec.system is written to _SYSTEM after the fixed eleven.
//   buildWorkbook(spec) returns { wb, filename, rows, columns, droppedDropdowns, lists } without downloading
//   (buildAndDownload = buildWorkbook + the download).
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
    var INLINE_LIST_LIMIT = 255;

    function argbFill(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }
    function colLetterCount(n) { return n; }
    function s(v) { return String(v == null ? '' : v); }
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    function colLetter(n) { var r = ''; while (n > 0) { var m = (n - 1) % 26; r = String.fromCharCode(65 + m) + r; n = Math.floor((n - 1) / 26); } return r; }
    function inlineList(values) { return '"' + values.map(function (v) { return s(v).replace(/"/g, ''); }).join(',') + '"'; }

    function isExcelJsReady() { return !!(window.ExcelJS && window.ExcelJS.Workbook); }

    // One data sheet. listRefs: { <column key>: <range formula> } for this sheet; dropped collects inline lists over the limit.
    function writeDataSheet(wb, sp, isMaster, listRefs, dropped) {
        var columns = sp.columns || [];
        var sheetName = sp.sheetName || 'Template';
        var hasInstruction = !!s(sp.instructionRow).trim();
        var headerRowNo = hasInstruction ? 2 : 1;   // freeze rows 1..headerRowNo (§2)

        var ws = wb.addWorksheet(sheetName, {
            views: [{ state: 'frozen', xSplit: 0, ySplit: headerRowNo }]
        });

        var ncol = columns.length;

        // (1) Optional instruction row (row 1).
        if (hasInstruction) {
            ws.getRow(1).getCell(1).value = s(sp.instructionRow);
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
        if (sp.exampleRow) {
            var ex = Object.assign({}, sp.exampleRow); ex.row_type = 'example';
            rowsToWrite.push({ data: ex, kind: 'example' });
        }
        (sp.rows || []).forEach(function (r) {
            var d = Object.assign({}, r); if (d.row_type == null) d.row_type = 'data';
            rowsToWrite.push({ data: d, kind: 'data' });
        });
        var blanks;
        if (sp.templateMaxRow != null) {
            // Extend the prepared template area down to templateMaxRow (business columns get yellow
            // fill + unlocked cells across the whole area). rowsToWrite so far = example + existing.
            var lastRowIfNoBlanks = dataStart + rowsToWrite.length - 1;
            blanks = Math.max(0, sp.templateMaxRow - lastRowIfNoBlanks);
        } else {
            blanks = (sp.blankInputRows != null) ? sp.blankInputRows : BLANK_INPUT_ROWS;
        }
        for (var b = 0; b < blanks; b++) rowsToWrite.push({ data: {}, kind: 'blank' });

        rowsToWrite.forEach(function (rw, ri) {
            var excelRow = ws.getRow(dataStart + ri);
            columns.forEach(function (c, ci) {
                var cell = excelRow.getCell(ci + 1);
                var val = rw.data.hasOwnProperty(c.key) ? rw.data[c.key] : '';
                cell.value = (val === '' || val == null) ? null : val;
                // R4 (2026-10-29), opt-in: a column spec's numFmt ('@' text / 'yyyy-mm-dd' day) on every cell of it, blank input rows included -
                // what a user TYPES keeps its form (a spec without numFmt writes exactly what it wrote before)
                if (c.numFmt) cell.numFmt = c.numFmt;

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
                // R3-IMPORT: a column whose list goes to the hidden list sheet validates against its range - no 255 limit.
                if (c.dropdown && c.dropdown.length && rw.kind !== 'example') {
                    var ref = listRefs[c.key];
                    if (ref) {
                        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [ref], showErrorMessage: !!c.strictDropdown };
                    } else {
                        var list = inlineList(c.dropdown);
                        if (list.length <= INLINE_LIST_LIMIT) {   // Excel inline-list limit
                            cell.dataValidation = { type: 'list', allowBlank: true, formulae: [list], showErrorMessage: false };
                        } else if (dropped.indexOf(sheetName + '.' + c.key) < 0) dropped.push(sheetName + '.' + c.key);   // R3-IMPORT: reported
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

        return { ws: ws, rows: rowsToWrite.length, columns: ncol };
    }

    /**
     * Build a formatted XLSX workbook (no download).
     * spec = {
     *   filename,                       // download name (.xlsx appended if missing)
     *   sheetName,                      // data sheet name (default 'Template')
     *   instructionRow,                 // optional string banner placed on row 1 (header then row 2)
     *   columns: [ { key, header, kind:'editable'|'locked'|'required'|'business',
     *                width?, comment?, dropdown?:[values], hidden?, dropdownSource?:'inline'|'sheet'|'auto', strictDropdown? } ],
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
     *   sheets: [ { sheetName, instructionRow, columns, rows, exampleRow, blankInputRows, templateMaxRow } ],   // R3-IMPORT, optional
     *   listSheetName,                     // R3-IMPORT, optional (default '_LISTS')
     *   systemExtra,                       // R3-IMPORT, optional: write the other spec.system keys too
     *   system: { template_id, template_name, template_version, module, generated_at,
     *             generated_by, export_mode, source_system, carrier_id?, carrier_name?, notes? }
     * }
     * Returns a Promise. Throws (rejects) if ExcelJS is unavailable so the caller can alert.
     */
    function buildWorkbook(spec) {
        if (!isExcelJsReady()) {
            return Promise.reject(new Error('XLSX engine (ExcelJS) not loaded — cannot export a formatted template.'));
        }
        spec = spec || {};
        var sheetSpecs = Array.isArray(spec.sheets) && spec.sheets.length ? spec.sheets : [spec];
        if (sheetSpecs.some(function (sp) { return !(sp.columns || []).length; })) return Promise.reject(new Error('Template spec has no columns.'));

        // Master Template mode (admin master-data maintenance) — no protection, no locked cells, no gray fill.
        var isMaster = spec.masterTemplate === true;

        var wb = new window.ExcelJS.Workbook();
        var listSheetName = s(spec.listSheetName) || '_LISTS';

        // R3-IMPORT: which lists go to the list sheet (decided before any data sheet is written)
        var lists = [], refsBySheet = sheetSpecs.map(function (sp) {
            var refs = {};
            (sp.columns || []).forEach(function (c) {
                if (!(c.dropdown && c.dropdown.length)) return;
                var src = c.dropdownSource || 'inline';
                if (src === 'sheet' || (src === 'auto' && inlineList(c.dropdown).length > INLINE_LIST_LIMIT)) {
                    var n = lists.length + 1, range = "'" + listSheetName + "'!$" + colLetter(n) + '$1:$' + colLetter(n) + '$' + c.dropdown.length;
                    lists.push({ name: 'KM_LIST_' + n, column: n, values: c.dropdown.slice(), range: range, for: (sp.sheetName || 'Template') + '.' + c.key });
                    refs[c.key] = range;
                }
            });
            return refs;
        });

        var dropped = [], totalRows = 0, totalCols = 0, sheets = [];
        sheetSpecs.forEach(function (sp, i) {
            var w = writeDataSheet(wb, sp, isMaster, refsBySheet[i], dropped);
            sheets.push(w.ws); totalRows += w.rows; totalCols += w.columns;
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
        if (spec.systemExtra === true) {   // R3-IMPORT: the other keys (scope, mode, exported_at ...) - display metadata, never trusted by a server
            var fixed = sysRows.map(function (kv) { return kv[0]; });
            Object.keys(sys).sort().forEach(function (k) { if (fixed.indexOf(k) < 0) sysRows.push([k, sys[k]]); });
        }
        sysRows.forEach(function (kv, i) {
            var r = sysWs.getRow(i + 1);
            r.getCell(1).value = kv[0];
            r.getCell(1).font = { bold: true };
            r.getCell(1).fill = argbFill(STYLE.systemKey);
            r.getCell(2).value = (kv[1] == null || kv[1] === '') ? null : kv[1];
        });
        sysWs.getColumn(1).width = 20;
        sysWs.getColumn(2).width = 40;

        // R3-IMPORT: the list sheet, after the data sheets and _SYSTEM (a parser taking the first sheet never sees it)
        if (lists.length) {
            var lw = wb.addWorksheet(listSheetName);
            lw.state = 'veryHidden';
            lists.forEach(function (l) {
                l.values.forEach(function (v, k) { lw.getRow(k + 1).getCell(l.column).value = s(v); });
                try { if (wb.definedNames && typeof wb.definedNames.add === 'function') wb.definedNames.add(l.range, l.name); } catch (e) { /* the range formula alone validates */ }
            });
        }

        // (5) Protect the data sheets (UX only — importer is the authority).
        // Master Template mode NEVER protects the sheet (admin edits everything freely).
        var chain = Promise.resolve();
        if (!isMaster && spec.protect !== false) {
            sheets.forEach(function (ws) {
                if (typeof ws.protect !== 'function') return;
                chain = chain.then(function () {
                    return Promise.resolve(ws.protect('', {
                        selectLockedCells: true, selectUnlockedCells: true,
                        formatCells: false, formatColumns: true, formatRows: true,
                        insertRows: true, deleteRows: true, sort: true, autoFilter: true
                    })).catch(function () { /* protection is best-effort UX */ });
                });
            });
        }

        var filename = s(spec.filename) || ('template_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        if (!/\.xlsx$/i.test(filename)) filename += '.xlsx';

        return chain.then(function () {
            return { wb: wb, filename: filename, rows: totalRows, columns: totalCols, droppedDropdowns: dropped,
                lists: lists.map(function (l) { return { name: l.name, range: l.range, for: l.for, count: l.values.length }; }) };
        });
    }

    function buildAndDownload(spec) {
        return buildWorkbook(spec).then(function (built) {
            return built.wb.xlsx.writeBuffer().then(function (buf) {
                var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = built.filename; document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
                var out = { filename: built.filename, rows: built.rows, columns: built.columns };
                if (built.droppedDropdowns.length) out.droppedDropdowns = built.droppedDropdowns;   // R3-IMPORT: reported, not silent
                if (built.lists.length) out.lists = built.lists;
                return out;
            });
        });
    }

    window.KM.templateExport = {
        buildAndDownload: buildAndDownload,
        buildWorkbook: buildWorkbook,   // R3-IMPORT
        isReady: isExcelJsReady,
        STYLE: STYLE
    };
})();
