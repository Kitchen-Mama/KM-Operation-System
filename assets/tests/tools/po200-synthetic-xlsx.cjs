#!/usr/bin/env node
'use strict';
// PO200 - synthetic test files for the native 200-row Sandbox test of "Import PO and Factory Stock".
//
// The operator downloads the NATIVE template from the isolated Sandbox page; this tool fills COPIES of it with invented
// rows. The schema, the scope, the _SYSTEM metadata and the dropdown lists are therefore the Sandbox's own:
//   - no schema is invented: columns are found by the header text of the downloaded file
//   - _SYSTEM is never edited, the template's example row stays where it is
//   - transaction_id, row_type, purchase_order_line_id and row_version are never written on a new row
//   - a dropdown cell is written EXACTLY as the dropdown shows it ("ID | label"), so the page's own mapping is exercised
//   - PO numbers are ZZTEST-<RUNTAG>-<CASE>-<nnn>: two runs never collide and nothing can match a real PO
// No network, no reading outside the given paths, no dependency beyond the vendored ExcelJS.
//
//   node po200-synthetic-xlsx.cjs new      --template <New-receipt template.xlsx> --out <dir> --tag <RUNTAG>
//                                          [--company "<dropdown text or ID>"] [--skus-file <txt>] [--order-date YYYY-MM-DD] [--force]
//   node po200-synthetic-xlsx.cjs existing --export <file exported by the page> --mode receipt|remaining --tag <RUNTAG> --out <dir>
//                                          [--case C04] [--force]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ExcelJS = require('../../vendor/exceljs-4.4.0.min.js');

const VERSION = 'po200-synthetic-xlsx/1';
const SHEET = 'StockPO', SYSTEM = '_SYSTEM', SEP = ' | ', MAX_ROWS = 200;
const MODULE = 'po_factory_stock', TEMPLATE_ID = 'KM_IMPORT_PO_FACTORY_STOCK';
// the column keys of this importer (82_ PFI_FIELDS_); a header is matched the way import-batch.js matches it: by its key or one of its aliases
const KEYS = ['row_type', 'transaction_id', 'company', 'po_no', 'sku', 'warehouse_id', 'quantity', 'unproduced_qty', 'ordered_qty', 'currency', 'order_date', 'purchase_order_line_id', 'row_version', 'note'];
const ALIASES = { unproduced_qty: ['unproduced_qty', '未生產數量', '未生產數量 unproduced_qty'] };
const NEVER_WRITTEN = ['transaction_id', 'row_type', 'purchase_order_line_id', 'row_version'];
const OWNER_SIZES = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 8];
const SKU_CAVEAT = 'This tool reads only the dropdown list of the template. It cannot know whether a SKU is duplicated or inactive in the SKU master: ' +
  'the 25-row control (01) is what reveals it. If the control is refused for a SKU, stop and choose SKUs with --skus-file.';

class Refusal extends Error { constructor(message) { super(message); this.refusal = true; } }
const refuse = message => { throw new Refusal(message); };
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const pad = (n, w) => String(n).padStart(w, '0');
const text = v => String(v == null ? '' : v).trim();

// the same reading of a cell as import-batch.js cellValue()
function cellValue(cell) {
  const v = cell && cell.value;
  if (v == null) return '';
  if (v instanceof Date) return v.getUTCFullYear() + '-' + pad(v.getUTCMonth() + 1, 2) + '-' + pad(v.getUTCDate(), 2);
  if (typeof v === 'object') {
    if (v.formula != null || v.sharedFormula != null) return '=' + String(v.formula || v.sharedFormula);
    if (v.error) return String(v.error);
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return v.result;
    return '';
  }
  return v;
}

function headerKey(label) {
  const t = text(label);
  if (KEYS.includes(t)) return t;
  for (const key of Object.keys(ALIASES)) if (ALIASES[key].includes(t)) return key;
  return '';
}
function findHeader(ws) {
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const cols = {}; let hits = 0, twice = '';
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => { const k = headerKey(cellValue(cell)); if (!k) return; if (cols[k]) twice = k; cols[k] = col; hits++; });
    if (hits >= Math.ceil(KEYS.length / 2)) { if (twice) refuse('The header "' + twice + '" appears twice in sheet ' + SHEET + '. Download a new template.'); return { row: r, cols }; }
  }
  return refuse('Sheet ' + SHEET + ': the header row was not found. Download a new template from the page.');
}
function readSystem(wb) {
  const ws = wb.getWorksheet(SYSTEM), data = {};
  if (!ws) refuse('The file has no ' + SYSTEM + ' sheet: it was not downloaded from the import page.');
  ws.eachRow(row => { const k = text(cellValue(row.getCell(1))); if (k) data[k] = cellValue(row.getCell(2)); });
  return data;
}
function systemCells(wb) {            // every cell of _SYSTEM as text, for the "never edited" self-check
  const ws = wb.getWorksheet(SYSTEM), out = [];
  if (!ws) return out;
  ws.eachRow({ includeEmpty: false }, (row, r) => { row.eachCell({ includeEmpty: false }, (cell, c) => { const v = cellValue(cell); if (v !== '' && v != null) out.push(r + ':' + c + '=' + JSON.stringify(v)); }); });
  return out;
}
function rowObject(ws, header, r) {
  const o = {}; let any = false;
  for (const key of Object.keys(header.cols)) { const v = cellValue(ws.getCell(r, header.cols[key])); o[key] = v; if (key !== 'row_type' && v !== '' && v != null) any = true; }
  return { values: o, any };
}
// data rows = every row under the header that is neither the example row nor wholly blank (the rule of import-batch.js parseWorkbook)
function readRows(ws, header) {
  const out = { example: [], data: [] };
  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = rowObject(ws, header, r);
    if (text(row.values.row_type).toLowerCase() === 'example') { out.example.push(r); continue; }
    if (row.any) out.data.push({ row: r, values: row.values });
  }
  return out;
}
function option(textValue) { const t = String(textValue), at = t.indexOf(SEP); return { text: t, id: at < 0 ? t : t.slice(0, at) }; }
// the dropdown of one column: the inline list of its data-validation, or the cells of the range it names (the hidden _LISTS sheet)
function dropdown(wb, ws, col, fromRow) {
  let formula = '';
  for (let r = fromRow; r <= Math.max(ws.rowCount, fromRow + 5) && !formula; r++) {
    const dv = ws.getCell(r, col).dataValidation;
    if (dv && dv.type === 'list' && dv.formulae && dv.formulae.length) formula = String(dv.formulae[0]);
  }
  if (!formula) return [];
  if (formula.charAt(0) === '"') return formula.slice(1, -1).split(',').filter(v => v !== '').map(option);
  const m = /^=?'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/.exec(formula);
  if (!m || m[2] !== m[4]) refuse('A dropdown of this template is not a list this tool can read. Download a new template.');
  const lw = wb.getWorksheet(m[1]);
  if (!lw) refuse('The dropdown list sheet "' + m[1] + '" is missing from the template.');
  const out = [];
  for (let r = Number(m[3]); r <= Number(m[5]); r++) { const v = cellValue(lw.getCell(m[2] + r)); if (v !== '' && v != null) out.push(option(v)); }
  return out;
}
function pick(list, wanted, what) {
  const w = String(wanted);
  let hits = list.filter(o => o.text === w);
  if (!hits.length) hits = list.filter(o => o.id === w);
  if (!hits.length) refuse(what + ' "' + w + '" is not in the dropdown list of this template.');
  if (hits.length > 1) refuse(what + ' "' + w + '" matches ' + hits.length + ' entries of the dropdown list. Give the exact dropdown text.');
  return hits[0];
}
function dayBefore(day) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
function validDay(day) { return /^\d{4}-\d{2}-\d{2}$/.test(day) && !isNaN(new Date(day + 'T00:00:00Z').getTime()) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day; }
function checkTag(tag) {
  if (tag == null || tag === true || tag === '') refuse('--tag <RUNTAG> is required (4-12 characters, A-Z and 0-9). Use a new one for every run.');
  if (!/^[A-Z0-9]{4,12}$/.test(String(tag))) refuse('--tag must be 4-12 characters of A-Z and 0-9 (got "' + tag + '").');
  return String(tag);
}
async function load(file, what) {
  if (!file || file === true) refuse(what + ' is required.');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) refuse(what + ': the file does not exist.');
  if (!/\.xlsx$/i.test(file)) refuse(what + ' must be an .xlsx file.');
  const buffer = fs.readFileSync(file), wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (e) { refuse(what + ' could not be read as an .xlsx workbook.'); }
  return { buffer, wb };
}
function poNumber(tag, caseId, n) { return 'ZZTEST-' + tag + '-' + caseId + '-' + pad(n, 3); }

// ---- the cases: each is a list of { po, sku, quantity, unproduced, ordered } ----
function planCases(tag, skus) {
  const S = skus.length, per = Math.min(S, MAX_ROWS), cases = [];
  const line = (caseId, poIndex, sku, q, un, ord) => ({ po: poNumber(tag, caseId, poIndex), sku, quantity: q, unproduced: un, ordered: ord });
  cases.push({ id: '01', file: '01-control-25.xlsx', rows: skus.slice(0, 25).map(s => line('C01', 1, s, 10, 90, 100)),
    expected: 'Validates and commits. 1 new PO with 25 lines; factory stock +10 on each of the 25 SKUs (one stock movement each); remaining 10, shipped 0 per line.' });
  const two = []; let n = 0;
  OWNER_SIZES.forEach((size, p) => { for (let k = 0; k < size; k++, n++) two.push(line('C02', p + 1, skus[n % 31], 0, 100, 100)); });
  cases.push({ id: '02', file: '02-owner-shape-zero-40.xlsx', rows: two,
    expected: 'Validates and commits. 14 new POs with 40 lines over 31 SKUs; every quantity is 0, so NO factory stock row and NO stock movement is added; every line has remaining 0, shipped 0, ordered 100.' });
  cases.push({ id: '03', file: '03-zero-200.xlsx', rows: Array.from({ length: 200 }, (_, i) => line('C03', Math.floor(i / per) + 1, skus[i % per], 0, 100, 100)),
    expected: 'Validates and commits as ONE batch. ' + Math.ceil(200 / per) + ' new PO(s) with 200 lines; NO factory stock row and NO stock movement is added; the last row of the file is stored.' });
  if (S >= 200) cases.push({ id: '04', file: '04-one-po-200.xlsx', rows: skus.slice(0, 200).map(s => line('C04', 1, s, 10, 90, 100)),
    expected: 'Validates and commits as ONE batch. 1 new PO with 200 lines; factory stock +10 on each of 200 SKUs, 200 stock movements.' });
  else cases.push({ id: '04', file: '04-fewest-pos-200.xlsx', changed: true, rows: Array.from({ length: 200 }, (_, i) => line('C04', Math.floor(i / per) + 1, skus[i % per], 10, 90, 100)),
    expected: 'CASE CHANGED: the SKU list has only ' + S + ' usable SKUs, so "1 PO x 200 SKUs" cannot be built. This file is ' + Math.ceil(200 / per) + ' POs (the fewest possible) with 200 lines in total. ' +
      'Validates and commits as ONE batch; factory stock +10 per line. The one-PO-200-lines shape is NOT covered by this run.' });
  cases.push({ id: '05', file: '05-many-po-200.xlsx', rows: Array.from({ length: 200 }, (_, i) => line('C05', i + 1, skus[i % per], 10, 90, 100)),
    expected: 'Validates and commits as ONE batch. 200 new POs of one line each; factory stock +10 per line, 200 stock movements. The largest ordinary request; about 107,000 audit cells are added.' });
  cases.push({ id: '06', file: '06-limit-201.xlsx', rows: Array.from({ length: 201 }, (_, i) => line('C06', i + 1, skus[i % per], 10, 90, 100)),
    expected: 'REFUSED IN THE PAGE when the file is chosen ("At most 200 rows ... This file has 201"). Nothing is sent, nothing is written. Validate stays unavailable.' });
  return cases;
}
function stats(rows) {       // rows: [{ company, po_no, sku, quantity, unproduced_qty, ordered_qty }] as READ BACK from a written file
  const num = v => (v === '' || v == null ? 0 : Number(v)), per = {};
  rows.forEach(r => { per[r.po_no] = (per[r.po_no] || 0) + 1; });
  const skus = [...new Set(rows.map(r => String(r.sku)))];
  return { data_rows: rows.length, po_count: Object.keys(per).length, distinct_skus: skus.length, lines_per_po: Object.keys(per).map(k => per[k]).sort((a, b) => a - b),
    sum_quantity: rows.reduce((a, r) => a + num(r.quantity), 0), sum_unproduced: rows.reduce((a, r) => a + num(r.unproduced_qty), 0), sum_ordered: rows.reduce((a, r) => a + num(r.ordered_qty), 0), skus_used: skus };
}
// what the file that was just written really holds - read back with a fresh workbook, never taken from the plan
async function inspect(buffer) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(SHEET); if (!ws) refuse('SELF-CHECK: the written file has no ' + SHEET + ' sheet.');
  const header = findHeader(ws), rows = readRows(ws, header);
  return { header, example_rows: rows.example.length, rows: rows.data.map(d => d.values), system: systemCells(wb) };
}
function selfCheckNew(seen, plan, templateSystem, ctx) {
  const bad = why => refuse('SELF-CHECK FAILED for ' + plan.file + ': ' + why + '. The file was not kept.');
  if (seen.example_rows !== 1) bad('the template example row is not in place');
  if (JSON.stringify(seen.system) !== JSON.stringify(templateSystem)) bad(SYSTEM + ' differs from the template');
  if (seen.rows.length !== plan.rows.length) bad('it holds ' + seen.rows.length + ' data rows, not ' + plan.rows.length);
  const keys = {};
  seen.rows.forEach((r, i) => {
    const p = plan.rows[i];
    NEVER_WRITTEN.forEach(k => { if (text(r[k]) !== '') bad(k + ' is not blank on data row ' + (i + 1)); });
    if (r.company !== ctx.company.text || r.warehouse_id !== ctx.factory.text || r.sku !== p.sku.text || r.po_no !== p.po) bad('data row ' + (i + 1) + ' does not hold the planned identity');
    if (typeof r.po_no !== 'string' || typeof r.sku !== 'string') bad('data row ' + (i + 1) + ' identity is not text');
    if (r.quantity !== p.quantity || r.unproduced_qty !== p.unproduced || r.ordered_qty !== p.ordered) bad('data row ' + (i + 1) + ' quantities differ from the plan');
    if (r.order_date !== ctx.orderDate) bad('data row ' + (i + 1) + ' order_date is not ' + ctx.orderDate);
    const k = r.company + '|' + r.po_no + '|' + r.sku; if (keys[k]) bad('duplicate (company, po_no, sku) on data row ' + (i + 1)); keys[k] = true;
  });
}

async function generateNew(o) {
  const tag = checkTag(o.tag);
  if (!o.out || o.out === true) refuse('--out <dir> is required.');
  const t = await load(o.template, '--template');
  const ws = t.wb.getWorksheet(SHEET), sys = readSystem(t.wb);
  if (!ws || sys.module !== MODULE || sys.template_id !== TEMPLATE_ID) refuse('This file is not a StockPO template of "Import PO and Factory Stock". Download the New receipt template from the page.');
  if (sys.mode !== 'NEW_RECEIPT' || sys.export_mode !== 'BLANK') refuse('This file is not a blank New receipt template (it says mode ' + text(sys.mode) + ', ' + text(sys.export_mode) + '). Choose "New receipt" on the page and download again.');
  const header = findHeader(ws), need = ['company', 'po_no', 'sku', 'warehouse_id', 'quantity', 'unproduced_qty', 'ordered_qty', 'order_date'];
  need.forEach(k => { if (!header.cols[k]) refuse('The template has no "' + k + '" column: it is not a StockPO New receipt template of this version.'); });
  const found = readRows(ws, header);
  if (found.example.length !== 1 || found.example[0] !== header.row + 1) refuse('The template example row is not where the page puts it. Download a new template; do not edit it.');
  if (found.data.length) refuse('The template already holds ' + found.data.length + ' data row(s). Use a freshly downloaded, unedited template.');
  const first = header.row + 2;
  const lists = { company: dropdown(t.wb, ws, header.cols.company, first), sku: dropdown(t.wb, ws, header.cols.sku, first), warehouse_id: dropdown(t.wb, ws, header.cols.warehouse_id, first) };
  Object.keys(lists).forEach(k => { if (!lists[k].length) refuse('The ' + k + ' dropdown of this template is empty or missing. Nothing was written. Check the Sandbox masters and download again.'); });
  // the factory this template was downloaded for: the scope saved in _SYSTEM, and the example row
  let scope = {}; try { scope = JSON.parse(text(sys.scope) || '{}') || {}; } catch (e) { refuse('The template scope in ' + SYSTEM + ' cannot be read.'); }
  const example = rowObject(ws, header, header.row + 1).values, fromScope = text(scope.warehouse_id), fromExample = text(example.warehouse_id);
  if (fromScope && fromExample && fromScope !== fromExample) refuse('The template names two different factories (scope and example row). Download a new template.');
  if (!fromScope && !fromExample) refuse('The template was not downloaded for one factory. Choose the factory on the page, then download.');
  const factory = pick(lists.warehouse_id, fromScope || fromExample, 'The factory of this template');
  let company;
  if (o.company != null && o.company !== true && o.company !== '') company = pick(lists.company, o.company, 'Company');
  else if (lists.company.length === 1) company = lists.company[0];
  else refuse('The template offers ' + lists.company.length + ' companies. Name one with --company "<dropdown text or ID>": ' + lists.company.map(c => c.text).join(' ; '));
  // SKUs: entries whose ID is unique in the list, in list order - or the operator's own file
  const count = {}; lists.sku.forEach(s => { count[s.id] = (count[s.id] || 0) + 1; });
  const usable = lists.sku.filter(s => count[s.id] === 1), skippedIds = [...new Set(lists.sku.filter(s => count[s.id] > 1).map(s => s.id))];
  let skus = usable, source = 'the first usable entries of the template SKU dropdown, in list order';
  if (o.skusFile != null && o.skusFile !== true && o.skusFile !== '') {
    if (!fs.existsSync(o.skusFile)) refuse('--skus-file: the file does not exist.');
    const wanted = fs.readFileSync(o.skusFile, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l && l.charAt(0) !== '#');
    skus = wanted.map(w => pick(usable, w, 'SKU'));
    if (new Set(skus.map(s => s.id)).size !== skus.length) refuse('--skus-file names the same SKU more than once.');
    source = '--skus-file (' + skus.length + ' SKUs)';
  }
  if (skus.length < 31) refuse('Only ' + skus.length + ' usable SKUs; the cases need at least 31 different SKUs (case 02). Nothing was written.');
  let orderDate = o.orderDate;
  if (orderDate == null || orderDate === true || orderDate === '') {
    const ex = text(example.order_date);       // the server's day when the template was downloaded
    orderDate = dayBefore(validDay(ex) ? ex : new Date().toISOString().slice(0, 10));
  }
  if (!validDay(String(orderDate))) refuse('--order-date must be a real day written YYYY-MM-DD.');
  orderDate = String(orderDate);
  const plans = planCases(tag, skus), ctx = { company, factory, orderDate }, templateSystem = systemCells(t.wb);
  fs.mkdirSync(o.out, { recursive: true });
  const manifestFile = path.join(o.out, 'MANIFEST.json');
  [...plans.map(p => path.join(o.out, p.file)), manifestFile].forEach(f => { if (fs.existsSync(f) && !o.force) refuse('The output folder already holds ' + path.basename(f) + '. Use an empty folder (or --force). Nothing was written.'); });
  const files = [], written = [];
  try {
    for (const plan of plans) {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(t.buffer);
      const sheet = wb.getWorksheet(SHEET), style = {};
      Object.keys(header.cols).forEach(k => { style[k] = sheet.getCell(first, header.cols[k]).numFmt; });
      plan.rows.forEach((r, i) => {
        const row = first + i, put = (key, value) => { const cell = sheet.getCell(row, header.cols[key]); cell.value = value; if (style[key] && cell.numFmt !== style[key]) cell.numFmt = style[key]; };
        put('company', company.text); put('po_no', r.po); put('sku', r.sku.text); put('warehouse_id', factory.text);
        put('quantity', r.quantity); put('unproduced_qty', r.unproduced); put('ordered_qty', r.ordered);
        put('order_date', orderDate);           // text YYYY-MM-DD in the template's date column: the form the page itself writes there
      });
      const buffer = Buffer.from(await wb.xlsx.writeBuffer()), seen = await inspect(buffer);
      if (o._skipSelfCheck !== true) selfCheckNew(seen, plan, templateSystem, ctx);
      const target = path.join(o.out, plan.file); fs.writeFileSync(target, buffer); written.push(target);
      const st = stats(seen.rows);
      files.push(Object.assign({ file: plan.file, case: plan.id, case_changed: plan.changed === true }, st, { skus_used: st.skus_used.map(s => option(s).id), sha256: sha256(buffer), bytes: buffer.length, expected_server_outcome: plan.expected }));
    }
  } catch (e) { written.forEach(f => { try { fs.unlinkSync(f); } catch (x) { /* nothing to remove */ } }); throw e; }
  const manifest = { tool: VERSION, command: 'new', run_tag: tag, generated_at: new Date().toISOString(), synthetic_only: true,
    template: { file: path.basename(o.template), sha256: sha256(t.buffer), template_version: text(sys.template_version), mode: text(sys.mode), generated_at: text(sys.generated_at) },
    factory: factory.id, company: company.id, order_date: orderDate, po_number_pattern: 'ZZTEST-' + tag + '-<CASE>-<nnn>',
    sku_source: source, sku_dropdown_entries: lists.sku.length, usable_skus: usable.length, skus_skipped_same_id_twice: skippedIds, sku_caveat: SKU_CAVEAT,
    never_written: NEVER_WRITTEN, files };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + '\n');
  return manifest;
}

async function generateExisting(o) {
  const tag = checkTag(o.tag);
  if (!o.out || o.out === true) refuse('--out <dir> is required.');
  const mode = o.mode === 'receipt' ? 'NEW_RECEIPT' : o.mode === 'remaining' ? 'UPDATE_REMAINING' : refuse('--mode must be receipt or remaining.');
  const x = await load(o.export, '--export');
  const ws = x.wb.getWorksheet(SHEET), sys = readSystem(x.wb);
  if (!ws || sys.module !== MODULE || sys.template_id !== TEMPLATE_ID) refuse('This file was not exported by "Import PO and Factory Stock".');
  if (sys.export_mode !== 'UPDATE_EXPORT') refuse('This file is a blank template, not an export with data. Export the current data from the page first.');
  if (sys.mode !== mode) refuse('This export is for ' + text(sys.mode) + ', but --mode ' + o.mode + ' needs ' + mode + '. Export again in the matching mode.');
  const header = findHeader(ws);
  ['po_no', 'sku', 'quantity', 'ordered_qty', 'purchase_order_line_id', 'row_version'].forEach(k => { if (!header.cols[k]) refuse('The export has no "' + k + '" column.'); });
  let prefix = 'ZZTEST-' + tag + '-', caseId = '';
  if (o.case != null && o.case !== true && o.case !== '') {
    caseId = String(o.case).toUpperCase(); if (/^\d{2}$/.test(caseId)) caseId = 'C' + caseId;
    if (!/^C\d{2}$/.test(caseId)) refuse('--case must look like C04.');
    prefix += caseId + '-';
  }
  const read = readRows(ws, header), all = read.data, tagged = all.filter(d => String(d.values.po_no).indexOf(prefix) === 0), kept = tagged.slice(0, MAX_ROWS);
  if (!tagged.length) refuse('No row of this export has a PO number starting with ' + prefix + ' (' + all.length + ' rows read). Nothing was written.');
  const file = mode === 'NEW_RECEIPT' ? '07-existing-receipt-200.xlsx' : '08-update-remaining-200.xlsx', target = path.join(o.out, file);
  if (fs.existsSync(target) && !o.force) refuse('The output folder already holds ' + file + '. Use another folder (or --force). Nothing was written.');
  const intOf = v => (/^\d+$/.test(text(v)) ? Number(text(v)) : null);
  kept.forEach(d => {
    if (!text(d.values.purchase_order_line_id) || !text(d.values.row_version)) refuse('A tagged row has no line ID or row version (sheet row ' + d.row + '): this is not a row the page exported.');
    if (mode === 'UPDATE_REMAINING' && !(intOf(d.values.quantity) >= 1)) refuse('A tagged row has no remaining quantity of at least 1 (sheet row ' + d.row + '); remaining - 1 cannot be built.');
    if (mode === 'NEW_RECEIPT' && !(intOf(d.values.ordered_qty) >= 5)) refuse('A tagged row has an ordered quantity below 5 (sheet row ' + d.row + ').');
  });
  // every data row is emptied, then only the kept rows are written back, top down, with their own values: a row that is not in the file cannot change
  const cols = Object.keys(header.cols), first = (read.example.length ? Math.max(...read.example) : header.row) + 1, keepRaw = kept.map(d => { const o2 = {}; cols.forEach(k => { o2[k] = ws.getCell(d.row, header.cols[k]).value; }); return o2; });
  const before = kept.map(d => Object.assign({}, d.values));
  all.forEach(d => { cols.forEach(k => { ws.getCell(d.row, header.cols[k]).value = null; }); });
  keepRaw.forEach((raw, i) => {
    cols.forEach(k => { ws.getCell(first + i, header.cols[k]).value = raw[k]; });
    const q = ws.getCell(first + i, header.cols.quantity);
    if (mode === 'NEW_RECEIPT') { q.value = 5; if (header.cols.unproduced_qty) ws.getCell(first + i, header.cols.unproduced_qty).value = null; }
    else q.value = intOf(before[i].quantity) - 1;
  });
  const buffer = Buffer.from(await x.wb.xlsx.writeBuffer()), seen = await inspect(buffer);
  if (o._skipSelfCheck !== true) {
    const bad = why => refuse('SELF-CHECK FAILED for ' + file + ': ' + why + '. The file was not kept.');
    if (JSON.stringify(seen.system) !== JSON.stringify(systemCells((await load(o.export, '--export')).wb))) bad(SYSTEM + ' differs from the export');
    if (seen.rows.length !== kept.length) bad('it holds ' + seen.rows.length + ' data rows, not ' + kept.length);
    seen.rows.forEach((r, i) => {
      if (String(r.po_no).indexOf(prefix) !== 0) bad('an untagged row is still in the file');
      Object.keys(r).forEach(k => { if (k === 'quantity' || k === 'row_type' || (k === 'unproduced_qty' && mode === 'NEW_RECEIPT')) return; if (r[k] !== before[i][k]) bad(k + ' changed on data row ' + (i + 1)); });
      if (r.quantity !== (mode === 'NEW_RECEIPT' ? 5 : intOf(before[i].quantity) - 1)) bad('quantity is not the planned value on data row ' + (i + 1));
    });
  }
  fs.mkdirSync(o.out, { recursive: true }); fs.writeFileSync(target, buffer);
  const num = v => (v === '' || v == null ? 0 : Number(v)), st = stats(seen.rows);
  const entry = Object.assign({ file, case: mode === 'NEW_RECEIPT' ? '07' : '08', mode, run_tag: tag, case_filter: caseId || null, source_export: path.basename(o.export), source_sha256: sha256(x.buffer),
    rows_in_export: all.length, rows_tagged: tagged.length, rows_kept: kept.length, rows_dropped_untagged: all.length - tagged.length, rows_dropped_over_limit: tagged.length - kept.length },
  st, { skus_used: st.skus_used.map(s => option(s).id), sum_quantity_before: before.reduce((a, r) => a + num(r.quantity), 0), sum_quantity_after: st.sum_quantity,
    changed_columns: mode === 'NEW_RECEIPT' ? ['quantity (blank -> 5)', 'unproduced_qty (left blank)'] : ['quantity (remaining -> remaining - 1)'], sha256: sha256(buffer), bytes: buffer.length,
    fewer_than_200: kept.length < MAX_ROWS,
    expected_server_outcome: mode === 'NEW_RECEIPT'
      ? 'Validates and commits as ONE batch. Each of the ' + kept.length + ' existing lines receives +5 (completed +5, remaining +5, factory stock +5, one stock movement per line); shipped and ordered do not change. ' +
        'unproduced_qty is blank, so the legacy receipt rule applies (no declaration is compared with the stored counters). Lines created by cases 04/05 hold 10 of 100, so +5 is within the order. Every other PO line is absent from the file and cannot change.'
      : 'Validates and commits as ONE batch. Each of the ' + kept.length + ' lines gets remaining - 1 (completed - 1, factory stock - 1, one stock movement per line); shipped, ordered and reserved do not change. ' +
        'Uploading a file made from this same export again after the commit is refused as stale (PFI_STALE_EXPORT); the identical file is answered as already applied.' });
  const manifestFile = path.join(o.out, 'MANIFEST.json');
  let manifest = { tool: VERSION, synthetic_only: true, files: [] };
  if (fs.existsSync(manifestFile)) { try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (e) { refuse('MANIFEST.json in the output folder cannot be read; the workbook was written but not listed.'); } }
  manifest.files = (manifest.files || []).filter(f => f.file !== file).concat([entry]);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + '\n');
  return { manifest, entry };
}

function table(files) {
  const head = ['file', 'rows', 'POs', 'SKUs', 'qty', 'unproduced', 'ordered'];
  const lines = files.map(f => [f.file, f.data_rows, f.po_count, f.distinct_skus, f.sum_quantity, f.sum_unproduced, f.sum_ordered].map(String));
  const w = head.map((h, i) => Math.max(h.length, ...lines.map(l => l[i].length)));
  return [head, ...lines].map(l => l.map((c, i) => c.padEnd(w[i])).join('  ')).join('\n');
}
function parseArgs(argv) {
  const o = { _: [] }, names = { template: 'template', out: 'out', tag: 'tag', company: 'company', 'skus-file': 'skusFile', 'order-date': 'orderDate', export: 'export', mode: 'mode', case: 'case' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') o.force = true;
    else if (a.slice(0, 2) === '--') { const k = names[a.slice(2)]; if (!k) refuse('Unknown option ' + a + '.'); const v = argv[i + 1]; if (v == null || v.slice(0, 2) === '--') refuse(a + ' needs a value.'); o[k] = v; i++; }
    else o._.push(a);
  }
  return o;
}
async function main(argv, print) {
  const say = print || (line => console.log(line));
  try {
    const o = parseArgs(argv), command = o._[0];
    if (command === 'new') {
      const m = await generateNew(o);
      say(table(m.files));
      say('run tag ' + m.run_tag + ' - order date ' + m.order_date + ' - ' + m.usable_skus + ' usable SKUs (' + m.sku_source + ')');
      m.files.filter(f => f.case_changed).forEach(f => { say('*** CASE CHANGED *** ' + f.file + ': ' + f.expected_server_outcome); });
      say('NOTE ' + SKU_CAVEAT);
      say('WROTE ' + m.files.length + ' workbooks and MANIFEST.json');
      return 0;
    }
    if (command === 'existing') {
      const r = await generateExisting(o), e = r.entry;
      say(table([e]));
      say('kept ' + e.rows_kept + ' tagged row(s); dropped ' + e.rows_dropped_untagged + ' untagged and ' + e.rows_dropped_over_limit + ' over the 200-row limit; quantity sum ' + e.sum_quantity_before + ' -> ' + e.sum_quantity_after);
      if (e.fewer_than_200) say('*** FEWER THAN 200 ROWS *** ' + e.file + ' holds ' + e.rows_kept + ' rows: this is not the 200-row case.');
      say('WROTE ' + e.file + ' and MANIFEST.json');
      return 0;
    }
    refuse('Usage: po200-synthetic-xlsx.cjs new --template <xlsx> --out <dir> --tag <RUNTAG> [--company <text>] [--skus-file <txt>] [--order-date YYYY-MM-DD]\n' +
      '       po200-synthetic-xlsx.cjs existing --export <xlsx> --mode receipt|remaining --tag <RUNTAG> --out <dir> [--case C04]');
  } catch (e) {
    if (e && e.refusal) { say('REFUSED: ' + e.message); return 2; }
    say('FAILED: ' + (e && e.message || e)); return 1;
  }
  return 1;
}

module.exports = { main, generateNew, generateExisting, planCases, inspect, stats, OWNER_SIZES, KEYS, VERSION };
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
