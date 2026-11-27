'use strict';
// PO200 tools - shared test support. Nothing here is the tool under test.
//   pageKit()        the page's REAL template-export.js, import-batch.js and po-factory-import.js, evaluated in Node against the
//                    vendored ExcelJS: the workbook the page would download, the parser the page would run, the batch id it would make.
//                    (No DOM: only the functions that never touch the document are used.)
//   unzip(buffer)    the parts of an .xlsx, read with node:zlib only - an independent reader for "is _SYSTEM byte-identical".
//   systemPart(buf)  the raw XML of the _SYSTEM worksheet.
//   inspectFile()    what a generated file holds, read by the page's own parser, plus facts the parser hides (blank ids, example row).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const nodeCrypto = require('node:crypto');
const ExcelJS = require('../../vendor/exceljs-4.4.0.min.js');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));

function pageKit() {
  const window = { ExcelJS, KM: { DB: {} }, crypto: nodeCrypto.webcrypto };
  for (const file of ['assets/js/utils/template-export.js', 'assets/js/utils/import-batch.js', 'assets/js/utils/po-factory-import.js'])
    new Function('window', 'document', read(file))(window, undefined);
  const KM = window.KM, adapter = KM.poFactoryImport._adapter();
  return {
    KM, adapter,
    // the workbook the page builds from a server template answer (Download / export with data)
    async workbook(templateAnswer, mode, withData) {
      const built = await KM.templateExport.buildWorkbook(KM.importBatch._exportSpec(templateAnswer, adapter, mode, withData));
      return { buffer: Buffer.from(await built.wb.xlsx.writeBuffer()), filename: built.filename, lists: built.lists, dropped: built.droppedDropdowns };
    },
    parse: (buffer, templateAnswer) => KM.importBatch._parseWorkbook(buffer, templateAnswer),
    batchId: (parsed, templateAnswer) => Promise.resolve(KM.poFactoryImport._batchId(parsed, templateAnswer))
  };
}

function unzip(buffer) {
  const parts = new Map();
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  let at = buffer.readUInt32LE(eocd + 16);
  for (let n = buffer.readUInt16LE(eocd + 10); n > 0; n--) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buffer.readUInt16LE(at + 10), size = buffer.readUInt32LE(at + 20), nameLen = buffer.readUInt16LE(at + 28), extraLen = buffer.readUInt16LE(at + 30), commentLen = buffer.readUInt16LE(at + 32), local = buffer.readUInt32LE(at + 42);
    const name = buffer.slice(at + 46, at + 46 + nameLen).toString('utf8');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28), raw = buffer.slice(start, start + size);
    parts.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return parts;
}
// the worksheet part of a sheet, found through workbook.xml and its relationships
function sheetPart(buffer, sheetName) {
  const parts = unzip(buffer), wbXml = parts.get('xl/workbook.xml').toString('utf8'), rels = parts.get('xl/_rels/workbook.xml.rels').toString('utf8');
  const sheet = new RegExp('<sheet [^>]*name="' + sheetName + '"[^>]*>').exec(wbXml);
  if (!sheet) return null;
  const rid = /r:id="([^"]+)"/.exec(sheet[0])[1], rel = new RegExp('<Relationship [^>]*Id="' + rid + '"[^>]*>').exec(rels)[0], target = /Target="([^"]+)"/.exec(rel)[1].replace(/^\//, '');
  return { xml: parts.get(target.indexOf('xl/') === 0 ? target : 'xl/' + target), declaration: sheet[0] };
}

// what a workbook holds. `rows` are the page parser's rows when a template answer is given (IDs mapped back from "ID | label").
async function inspectFile(buffer, kit, templateAnswer) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('StockPO');
  let headerRow = 0; const cols = {};
  for (let r = 1; r <= 5 && !headerRow; r++) if ((ws.getRow(r).values || []).includes('po_no')) headerRow = r;
  ws.getRow(headerRow).eachCell((cell, col) => { cols[String(cell.value)] = col; });
  const raw = [], examples = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const o = { __row: r }; let any = false;
    Object.keys(cols).forEach(h => { const v = ws.getCell(r, cols[h]).value; o[h] = v; if (h !== 'row_type' && v != null && v !== '') any = true; });
    if (String(o.row_type || '') === 'example') examples.push(r); else if (any) raw.push(o);
  }
  const parsed = templateAnswer ? await kit.parse(buffer, templateAnswer) : null;
  return { headerRow, cols, raw, examples, parsed, rows: parsed ? parsed.sheets.StockPO : null, system: sheetPart(buffer, '_SYSTEM') };
}

// every non-empty cell of a sheet as { A1: text }, resolved through the shared-string table - read without ExcelJS
function sheetCells(buffer, sheetName) {
  const parts = unzip(buffer), part = sheetPart(buffer, sheetName);
  if (!part) return null;
  const shared = [], sst = parts.get('xl/sharedStrings.xml');
  if (sst) for (const m of sst.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
  const cells = {};
  for (const m of part.xml.toString('utf8').matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    if (!m[3]) continue;
    const type = /t="([^"]+)"/.exec(m[2]), v = /<v>([\s\S]*?)<\/v>/.exec(m[3]), inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[3]);
    if (!v && !inline) continue;
    cells[m[1]] = type && type[1] === 's' ? shared[Number(v[1])] : (v ? v[1] : inline[1]);
  }
  return { cells, declaration: part.declaration };
}

const OWNER_SIZES = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 8];
// The facts every file of a `new` run must have. Independent of the generator: the page's parser, an own zip reader, the manifest.
// ctx = { page, t (the server's template answer), template (Buffer), tag, company, factory, orderDate, usable (usable SKUs in the list) }
async function assertGenerated(dir, ctx) {
  const assert = require('node:assert/strict'), crypto = require('node:crypto');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'MANIFEST.json'), 'utf8')), per = Math.min(ctx.usable, 200), pos200 = Math.ceil(200 / per);
  const want = {
    '01': { file: '01-control-25.xlsx', rows: 25, pos: 1, skus: 25, q: 250, un: 2250, ord: 2500 },
    '02': { file: '02-owner-shape-zero-40.xlsx', rows: 40, pos: 14, skus: 31, q: 0, un: 4000, ord: 4000 },
    '03': { file: '03-zero-200.xlsx', rows: 200, pos: pos200, skus: per, q: 0, un: 20000, ord: 20000 },
    '04': { file: ctx.usable >= 200 ? '04-one-po-200.xlsx' : '04-fewest-pos-200.xlsx', rows: 200, pos: pos200, skus: per, q: 2000, un: 18000, ord: 20000 },
    '05': { file: '05-many-po-200.xlsx', rows: 200, pos: 200, skus: per, q: 2000, un: 18000, ord: 20000 },
    '06': { file: '06-limit-201.xlsx', rows: 201, pos: 201, skus: per, q: 2010, un: 18090, ord: 20100 } };
  assert.equal(manifest.run_tag, ctx.tag); assert.equal(manifest.files.length, 6); assert.equal(manifest.company, ctx.company); assert.equal(manifest.factory, ctx.factory); assert.equal(manifest.order_date, ctx.orderDate);
  assert.deepEqual(fs.readdirSync(dir).filter(f => /\.xlsx$/.test(f)).sort(), Object.keys(want).map(k => want[k].file).sort(), 'exactly the six workbooks');
  const dropdownOf = name => ctx.t.lists[name].map(it => (it.label ? it.value + ' | ' + it.label : it.value));
  const skuTexts = new Set(dropdownOf('skus')), companyText = dropdownOf('companies').filter(x => x.split(' | ')[0] === ctx.company)[0], factoryText = dropdownOf('factories').filter(x => x.split(' | ')[0] === ctx.factory)[0];
  const systemBefore = sheetCells(ctx.template, '_SYSTEM'), seen = {};
  assert(Object.keys(systemBefore.cells).length >= 10 && /state="veryHidden"/.test(systemBefore.declaration), 'the template has a veryHidden _SYSTEM sheet');
  for (const id of Object.keys(want)) {
    const w = want[id], m = manifest.files.filter(f => f.case === id)[0], label = w.file + ': ';
    assert(m, label + 'listed in the manifest'); assert.equal(m.file, w.file);
    const buffer = fs.readFileSync(path.join(dir, w.file)), x = await inspectFile(buffer, ctx.page, ctx.t), rows = x.rows;
    assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'), m.sha256, label + 'sha256 is the one in the manifest');
    // _SYSTEM: every cell, and the sheet's declaration (veryHidden), identical to the template's
    const systemAfter = sheetCells(buffer, '_SYSTEM');
    assert.deepEqual(systemAfter.cells, systemBefore.cells, label + '_SYSTEM cells are the template\'s'); assert.equal(systemAfter.declaration, systemBefore.declaration, label + '_SYSTEM is still veryHidden, same sheet');
    // the example row is where the page put it
    assert.deepEqual(x.examples, [x.headerRow + 1], label + 'the example row is in place');
    assert.equal(ctx.page.KM.importBatch.MAX_FILE_BYTES > buffer.length, true, label + 'under the page file-size limit');
    // the raw cells: dropdown text exactly, text as text, numbers as numbers, ids and versions blank
    assert.equal(x.raw.length, w.rows, label + 'raw data rows');
    for (const r of x.raw) {
      for (const k of ['row_type', 'transaction_id', 'purchase_order_line_id', 'row_version', 'currency', 'note']) assert.equal(r[k] == null || r[k] === '', true, label + k + ' is blank on sheet row ' + r.__row);
      assert.equal(r.company, companyText, label + 'company is the dropdown text'); assert.equal(r.warehouse_id, factoryText, label + 'factory is the dropdown text');
      assert.equal(typeof r.sku === 'string' && skuTexts.has(r.sku), true, label + 'sku is a dropdown text: ' + r.sku);
      assert.match(String(r.po_no), new RegExp('^ZZTEST-' + ctx.tag + '-C' + id + '-\\d{3}$')); assert.equal(typeof r.po_no, 'string');
      for (const k of ['quantity', 'ordered_qty']) assert.equal(typeof r[k], 'number', label + k + ' is a number');
      assert.equal(r.order_date, ctx.orderDate, label + 'order_date');
    }
    // what the PAGE reads: IDs mapped back, the example row left out
    assert.equal(rows.length, w.rows, label + 'data rows read by the page parser');
    const keys = new Set(), perPo = {}; let q = 0, un = 0, ord = 0;
    for (const r of rows) {
      assert.equal(r.company, ctx.company, label + 'the page maps the company back to its ID'); assert.equal(r.warehouse_id, ctx.factory); assert.equal(ctx.t.lists.skus.some(s => s.value === r.sku), true, label + 'the page maps the SKU back to an ID: ' + r.sku);
      assert.equal(r.transaction_id, ''); assert.equal(r.purchase_order_line_id, ''); assert.equal(r.row_version, '');
      const key = r.company + '|' + r.po_no + '|' + r.sku; assert.equal(keys.has(key), false, label + 'duplicate (company, po_no, sku): ' + key); keys.add(key);
      assert.equal(Number.isInteger(r.quantity) && Number.isInteger(r.unproduced_qty) && Number.isInteger(r.ordered_qty), true);
      assert.equal(r.quantity + r.unproduced_qty <= r.ordered_qty, true, label + 'quantity + unproduced <= ordered'); assert.equal(r.quantity > 0 || r.unproduced_qty > 0, true);
      perPo[r.po_no] = (perPo[r.po_no] || 0) + 1; q += r.quantity; un += r.unproduced_qty; ord += r.ordered_qty;
    }
    const skus = new Set(rows.map(r => r.sku)), sizes = Object.keys(perPo).map(k => perPo[k]).sort((a, b) => a - b);
    assert.equal(Object.keys(perPo).length, w.pos, label + 'PO count'); assert.equal(skus.size, w.skus, label + 'distinct SKUs');
    assert.deepEqual([q, un, ord], [w.q, w.un, w.ord], label + 'sums');
    assert.deepEqual([m.data_rows, m.po_count, m.distinct_skus, m.sum_quantity, m.sum_unproduced, m.sum_ordered], [w.rows, w.pos, w.skus, w.q, w.un, w.ord], label + 'the manifest says the same');
    assert.deepEqual([...m.skus_used].sort(), [...skus].sort(), label + 'the manifest lists the SKUs used'); assert.equal(typeof m.expected_server_outcome === 'string' && m.expected_server_outcome.length > 40, true);
    if (id === '02') { assert.deepEqual(sizes, OWNER_SIZES, label + 'lines per PO'); assert.equal(rows.every(r => r.quantity === 0 && r.unproduced_qty === 100 && r.ordered_qty === 100), true, label + 'every quantity 0, unproduced = ordered = 100'); }
    if (id === '03') assert.equal(rows.every(r => r.quantity === 0 && r.unproduced_qty === r.ordered_qty), true);
    if (id === '01' || id === '04' || id === '05') assert.equal(rows.every(r => r.quantity === 10 && r.unproduced_qty === 90 && r.ordered_qty === 100), true);
    if (id === '05' || id === '06') assert.equal(sizes.every(s => s === 1), true);
    seen[id] = { file: w.file, buffer, rows, parsed: x.parsed, manifest: m };
  }
  return { manifest, files: seen };
}

module.exports = { pageKit, unzip, sheetPart, sheetCells, inspectFile, assertGenerated, OWNER_SIZES, root, read, plain, ExcelJS };
