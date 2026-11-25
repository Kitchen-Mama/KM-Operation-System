// Local candidate only. Activation, schema and deployment require separate approval.
var PFI_SCHEMA_ = 'PO-FACTORY-IMPORT-1';
var PFI_BUILD_VERSION_ = "PFI1-R2-SBX-20261111-AF1-IU1-IU2-IU4-PG12R3-JR4";
var PFI_FIELDS_ = ['row_type', 'transaction_id', 'company', 'po_no', 'sku', 'warehouse_id', 'quantity', 'unproduced_qty', 'ordered_qty', 'currency', 'order_date', 'purchase_order_line_id', 'row_version', 'note'];
var PFI_MODES_ = ['NEW_RECEIPT', 'OPENING_PO_FOR_EXISTING_STOCK', 'UPDATE_REMAINING'];
// Until the stock writer supports resumable commits, keep synchronous dual-book batches small.
var PFI_MAX_INPUT_ROWS_ = 25;

function pfiFail_(code, text) { var e = new Error(text || code); e.importCode = code; throw e; }
function pfiInt_(v, positive) {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean' || !/^\d+$/.test(String(v).trim())) return null;
  var n = Number(v); return isFinite(n) && n <= 9007199254740991 && n >= (positive ? 1 : 0) ? n : null;
}
function pfiRead_(ss) {
  var issues = [], M = pmiMasters_(ss, issues, true), stock = pmiTable_(ss, 'factory_stock'), rd = imiFactoryRead_(ss);
  if (!M || !stock || issues.length || rd.issues.length) pfiFail_('PFI_MASTER_UNREADABLE', 'Required masters, stock or movement schema cannot be read.');
  return { M: M, stock: stock, rd: rd };
}
function pfiFactory_(x, raw) {
  var f = pmiFactory_(x.M, raw, { factory: 'ACTIVE' });
  if (!f.ok) pfiFail_('PFI_FACTORY_INVALID', 'Select one unique active factory ID.');
  return f.warehouse_id;
}
function pfiStock_(x, wh, sku) {
  var rows = x.stock.rows.filter(function (r) { return pmiS_(r.warehouse_id) === wh && pmiS_(r.sku) === sku; });
  if (rows.length > 1) pfiFail_('PFI_STOCK_DUPLICATE');
  if (!rows.length) return { current: 0, reserved: 0, exists: false };
  var c = pfiInt_(rows[0].fac_current_stock), r = pfiInt_(rows[0].fac_reserved_stock);
  if (c === null || r === null || r > c) pfiFail_('PFI_STOCK_UNKNOWN', 'Stock and reserved must be known nonnegative integers.');
  return { current: c, reserved: r, exists: true };
}
function pfiHeader_(x, company, no) {
  var sameNo = x.M.T.po.rows.filter(function (p) { return pmiS_(p.po_no) === no; });
  var a = sameNo.filter(function (p) {
    if (pmiS_(p.company)) return pmiS_(p.company) === company;
    return x.M.T.pol.rows.some(function (l) { return pmiS_(l.purchase_order_id) === pmiS_(p.purchase_order_id) && pmiS_(l.company) === company; });
  });
  if (!a.length && sameNo.some(function (p) { return !pmiS_(p.company); })) pfiFail_('PFI_PO_COMPANY_UNRESOLVED');
  if (a.length > 1) pfiFail_('PFI_PO_DUPLICATE'); return a[0] || null;
}
function pfiLineCompany_(h, l) {
  var co = pmiCompany_(pmiS_(l.company) || pmiS_(h.company));
  if (co.code) pfiFail_('PFI_PO_COMPANY_UNRESOLVED', 'Stored company is missing or invalid for PO ' + pmiS_(h.po_no) + ', SKU ' + pmiS_(l.sku) + ', line ' + pmiS_(l.purchase_order_line_id) + '. The file cannot change PO ownership. No data was changed.');
  return co.value;
}
function pfiExportLine_(x, h, l, wh, quantity) {
  var company = '', warning = '';
  try { company = pfiLineCompany_(h, l); }
  catch (e) { if (e.importCode !== 'PFI_PO_COMPANY_UNRESOLVED') throw e; warning = 'EXPORT_BLOCKED_COMPANY_UNKNOWN: omit this row from an update; source company needs owner confirmation.'; }
  return { transaction_id: '', company: company, po_no: h.po_no, sku: l.sku, warehouse_id: wh, quantity: quantity,
    ordered_qty: l.ordered_qty, currency: h.currency, order_date: pmiDay_(h.order_date),
    purchase_order_line_id: l.purchase_order_line_id, row_version: pfiVersion_(x, h, l, wh), note: warning };
}
function pfiCanonical_(v) {
  if (v instanceof Date) { if (!isFinite(v.getTime())) pfiFail_('PFI_DATE_UNKNOWN'); return v.toISOString(); }
  if (Array.isArray(v)) return v.map(pfiCanonical_);
  if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = pfiCanonical_(v[k]); }); return o; }
  return v;
}
function pfiVersion_(x, h, l, wh) {
  return imbSha_(JSON.stringify(imbSorted_(pfiCanonical_({ header: h, line: l, stock: pfiStock_(x, wh, pmiS_(l.sku)) }))));
}
function pfiCoverage_(x, wh, sku) {
  var headers = {}, total = 0, seen = {};
  x.M.T.po.rows.forEach(function (h) {
    var id = pmiS_(h.purchase_order_id); if (headers[id]) headers[id] = false; else if (headers[id] !== false) headers[id] = h;
  });
  x.M.T.pol.rows.forEach(function (l) {
    if (pmiS_(l.sku) !== sku) return;
    var h = headers[pmiS_(l.purchase_order_id)];
    if (!h) pfiFail_('PFI_PO_PARENT_UNKNOWN');
    var rawWh = pmiS_(l.supplier_warehouse_id) || pmiS_(h.warehouse_id || h.factory_id);
    var f = x.M.fmap[rawWh.toLowerCase()];
    if (!f || f.dup || !f.isFactory) pfiFail_('PFI_PO_FACTORY_UNKNOWN');
    if (pmiS_(f.warehouseId) !== wh) return;
    var id = pmiS_(l.purchase_order_line_id);
    if (!id || seen[id]) pfiFail_('PFI_PO_LINE_DUPLICATE'); seen[id] = true;
    var done = pfiInt_(l.completed_qty), shipped = pfiInt_(l.shipped_qty), rem = pfiInt_(l.remaining_qty);
    if (done === null || shipped === null || rem === null || done < shipped || rem !== done - shipped) pfiFail_('PFI_PO_COUNTER_UNKNOWN');
    if (/^(cancelled|closure)$/.test(pmiS_(h.order_status))) {
      if (rem) pfiFail_('PFI_INACTIVE_PO_HAS_STOCK'); return;
    }
    if (!pmiStatusDef_(pmiS_(h.order_status))) pfiFail_('PFI_PO_STATUS_UNKNOWN');
    if (Number(l.opening_completed_qty) > 0 && pmiS_(l.opening_reconcile_status) !== 'RECONCILED') pfiFail_('PFI_OPENING_UNRESOLVED');
    total += rem;
    if (total > 9007199254740991) pfiFail_('PFI_QUANTITY_OVERFLOW');
  });
  return total;
}
function pfiCoverageInfo_(x, wh, sku) {
  try { return { known: true, quantity: pfiCoverage_(x, wh, sku) }; }
  catch (e) {
    if (['PFI_PO_COUNTER_UNKNOWN','PFI_INACTIVE_PO_HAS_STOCK','PFI_OPENING_UNRESOLVED','PFI_PO_STATUS_UNKNOWN','PFI_PO_PARENT_UNKNOWN','PFI_PO_FACTORY_UNKNOWN','PFI_PO_LINE_DUPLICATE'].indexOf(e.importCode) < 0) throw e;
    return { known: false, code: e.importCode };
  }
}
function pfiCoverageWarning_(info, stock, wh, sku) {
  if (info.known && info.quantity === stock) return null;
  return { code: 'PFI_LEGACY_BALANCE_WARNING', warehouse_id: wh, sku: sku, physical_stock: stock,
    po_remaining: info.known ? info.quantity : null, reason: info.code || 'PFI_BASELINE_MISMATCH',
    message: 'Existing PO coverage and physical stock are not reconciled. Only this batch changes both by the same quantity; existing records and differences are not repaired.' };
}
function pfiTemplate_(ss, o) {
  var x = pfiRead_(ss), wh = o.scope && o.scope.warehouse_id, rows = [];
  if (wh) wh = pfiFactory_(x, wh);
  if (o.include_data && !wh) pfiFail_('PFI_FACTORY_REQUIRED');
  if (o.include_data && o.mode === 'OPENING_PO_FOR_EXISTING_STOCK') x.stock.rows.forEach(function (s) {
    if (pmiS_(s.warehouse_id) !== wh) return;
    var sku = pmiS_(s.sku), unassigned = pfiStock_(x, wh, sku).current - pfiCoverage_(x, wh, sku);
    if (unassigned < 0) pfiFail_('PFI_BASELINE_MISMATCH');
    if (unassigned > 0) rows.push({ transaction_id: '', company: '', po_no: '', sku: sku, warehouse_id: wh, quantity: unassigned, ordered_qty: '', currency: '', order_date: '', purchase_order_line_id: '', row_version: '', note: '' });
  });
  if (o.include_data && ['NEW_RECEIPT','UPDATE_REMAINING'].indexOf(o.mode) >= 0) x.M.T.pol.rows.forEach(function (l) {
    var h = x.M.T.po.rows.filter(function (p) { return pmiS_(p.purchase_order_id) === pmiS_(l.purchase_order_id); });
    if (h.length !== 1) return;
    var raw = pmiS_(l.supplier_warehouse_id) || pmiS_(h[0].warehouse_id), f = x.M.fmap[raw.toLowerCase()];
    if (!f || f.warehouseId !== wh) return;
    if (o.mode === 'UPDATE_REMAINING') {
      if (/^(cancelled|closure)$/.test(pmiS_(h[0].order_status))) return;
      var rem = pfiInt_(l.remaining_qty);
      if (rem === null) pfiFail_('PFI_PO_COUNTER_UNKNOWN');
      if (!rem) return;
    }
    rows.push(pfiExportLine_(x, h[0], l, wh, o.mode === 'UPDATE_REMAINING' ? Number(l.remaining_qty) : ''));
  });
  var blocked = rows.filter(function (r) { return !r.company; }).map(function (r) { return { code:'PFI_PO_COMPANY_UNRESOLVED',purchase_order_line_id:r.purchase_order_line_id,po_no:r.po_no,sku:r.sku }; });
  return { export_warnings: blocked, sheets: [{ name: 'StockPO', instruction: blocked.length ? blocked.length + ' rows have unknown company and cannot be updated. They are retained with blank company and a blocked note; no company was guessed.' : '', columns: PFI_FIELDS_.filter(function (k) { return k !== 'unproduced_qty' || o.mode === 'NEW_RECEIPT'; }).map(function (k) {
    var lists = { company: 'companies', sku: 'skus', warehouse_id: 'factories', currency: 'currencies' };
    return { key: k, header: k === 'unproduced_qty' ? '\u672a\u751f\u7522\u6578\u91cf unproduced_qty' : k, aliases: k === 'unproduced_qty' ? ['unproduced_qty', '\u672a\u751f\u7522\u6578\u91cf'] : [], type: k === 'order_date' ? 'date' : ['quantity','ordered_qty','unproduced_qty'].indexOf(k) >= 0 ? 'int' : 'text', list: lists[k],
      kind: ['row_type','transaction_id','purchase_order_line_id','row_version'].indexOf(k) >= 0 ? 'locked' : 'editable', hidden: ['row_type','transaction_id','purchase_order_line_id','row_version','currency'].indexOf(k) >= 0, required: ['company','po_no','sku','warehouse_id','quantity','ordered_qty','order_date'].indexOf(k) >= 0 };
  }), rows: rows,
    example: { row_type: 'example', transaction_id: '', company: 'ResUS', po_no: 'EXAMPLE-PO', sku: 'EXAMPLE-SKU', warehouse_id: wh || '', quantity: 40, ordered_qty: 40, currency: '', order_date: imbNow_().slice(0,10) } }],
    lists: pmiLists_(x.M), scope: o.scope, row_counts: { StockPO: rows.length }, complete: !!o.include_data,
    notes: ['Batch identity is generated by the system. Keep the hidden IDs and versions when updating an exported file. Re-uploading identical content from either page does not add stock again.',
      o.mode === 'UPDATE_REMAINING' ? 'quantity is the target remaining quantity, including reserved units. Shipped history and rows absent from this file never change. New rows must name NEW POs.' : 'quantity is a positive receipt delta or opening PO coverage, never a replacement stock balance. Existing PO lines require an exported line ID and row_version.',
      'NEW_RECEIPT: optional unproduced_qty declares units still to produce after this receipt. quantity + unproduced_qty must not exceed ordered_qty. For a NEW PO, the difference is historical shipped/consumed units; only quantity enters stock. Blank preserves the legacy receipt behavior. Zero quantity is allowed for a new PO with positive unproduced_qty.',
      'OPENING_PO_FOR_EXISTING_STOCK creates new PO coverage only, without adding stock.',
      'Opening must exactly cover the existing unassigned stock for the affected factory/SKU. Unrelated rows are untouched. No automatic reconciliation.'] };
}
function pfiInventoryRows_(req, x, wh) {
  var skipped = { unknown_sku: 0, rows: [] };
  var rows = (req.sheets.StockPO || []).filter(function (r) {
    if (pmiS_(r.row_type) === 'example') return false;
    if (Object.keys(r).some(function (k) { return k !== '__row' && PFI_FIELDS_.indexOf(k) < 0; })) pfiFail_('PFI_COLUMN_UNKNOWN');
    if (pmiS_(r.transaction_id) !== req.id) pfiFail_('PFI_TRANSACTION_ID_MISMATCH');
    if (pmiS_(r.warehouse_id) !== wh) pfiFail_('PFI_FACTORY_SCOPE_MISMATCH');
    var sku = pmiS_(r.sku);
    if (sku && !Object.prototype.hasOwnProperty.call(x.M.sku, sku)) {
      skipped.unknown_sku++;
      skipped.rows.push({ row: r.__row, sku: sku, code: 'SKU_NOT_FOUND' });
      return false;
    }
    return true;
  });
  if (!rows.length) pfiFail_(skipped.unknown_sku ? 'NO_APPLICABLE_SKUS' : 'IMPORT_EMPTY');
  return { rows: rows, skipped: skipped };
}
function pfiValidate_(ss, req) {
  if (((req.sheets && req.sheets.StockPO) || []).filter(function (r) { return pmiS_(r.row_type) !== 'example'; }).length > PFI_MAX_INPUT_ROWS_)
    return { issues: [{ sheet: 'StockPO', code: 'PFI_BATCH_TOO_LARGE', message: 'At most 25 rows per PO / factory stock import. Split into separate files before validation; no rows were written.' }], plan: null, preview: { counts: { reject: 1 } }, state: {} };
  if (req.mode === 'UPDATE_REMAINING') return pfiValidateRemaining_(ss, req);
  var issues = [], empty = { issues: issues, plan: null, preview: { rows: [], counts: { reject: 0 } }, state: {} };
  try {
    var x = pfiRead_(ss), wh = pfiFactory_(x, req.scope.warehouse_id);
    var effectiveDay = pmiS_(req.scope.as_of_date) || imbNow_().slice(0,10);
    if (Object.keys(req.scope).some(function (k) { return ['warehouse_id','as_of_date'].indexOf(k) < 0; }) || !imbDate_(effectiveDay)) pfiFail_('PFI_SCOPE_INVALID');
    var input = pfiInventoryRows_(req, x, wh), rows = input.rows;
    var heads = {}, lines = [], existing = [], keys = {}, seen = {}, warnings = [], productionPreview = [], issueRow = null;
    rows.forEach(function (r) {
      issueRow = r;
      if (Object.keys(r).some(function (k) { return k !== '__row' && PFI_FIELDS_.indexOf(k) < 0; })) pfiFail_('PFI_COLUMN_UNKNOWN');
      if (pmiS_(r.transaction_id) !== req.id) pfiFail_('PFI_TRANSACTION_ID_MISMATCH');
      if (pmiS_(r.warehouse_id) !== wh) pfiFail_('PFI_FACTORY_SCOPE_MISMATCH');
      var declared = pmiS_(r.unproduced_qty) !== '', pending = declared ? pfiInt_(r.unproduced_qty) : null;
      if (declared && req.mode !== 'NEW_RECEIPT') pfiFail_('PFI_UNPRODUCED_MODE_NOT_ALLOWED');
      if (declared && pending === null) pfiFail_('PFI_UNPRODUCED_INVALID', 'unproduced_qty must be a nonnegative whole number.');
      var co = pmiCompany_(r.company), sku = pmiS_(r.sku), no = pmiS_(r.po_no), q = pfiInt_(r.quantity, !declared);
      if (co.code || !no || !x.M.sku[sku] || x.M.sku[sku].dup || q === null || !imbDate_(pmiDay_(r.order_date)) || pmiDay_(r.order_date) > effectiveDay || pfiInt_(r.ordered_qty, true) === null) pfiFail_('PFI_ROW_INVALID');
      if (declared && q > Number(r.ordered_qty) - pending) pfiFail_('PFI_QUANTITY_PLUS_UNPRODUCED_EXCEEDS_ORDERED', 'quantity + unproduced_qty must be <= ordered_qty.');
      if (!q && !(pending > 0)) pfiFail_('PFI_ROW_INVALID', 'A new PO needs stock or a positive quantity still to produce.');
      var key = wh + '||' + sku, lk = co.value + '|' + no + '|' + sku;
      if (seen[lk]) pfiFail_('PFI_FILE_DUPLICATE_LINE'); seen[lk] = true;
      if (q > 0) keys[key] = (keys[key] || 0) + q;
      if (keys[key] > 9007199254740991) pfiFail_('PFI_QUANTITY_OVERFLOW');
      var h = pfiHeader_(x, co.value, no);
      if (h) {
        if (req.mode !== 'NEW_RECEIPT') pfiFail_('PFI_OPENING_REQUIRES_NEW_PO');
        var matches = x.M.T.pol.rows.filter(function (l) { return pmiS_(l.purchase_order_line_id) === pmiS_(r.purchase_order_line_id); });
        var l = matches.length === 1 ? matches[0] : null;
        if (!l || pmiS_(l.purchase_order_id) !== pmiS_(h.purchase_order_id) || pmiS_(l.sku) !== sku || pfiLineCompany_(h, l) !== co.value) pfiFail_('PFI_LINE_ID_REQUIRED');
        if (!pmiS_(r.row_version) || pmiS_(r.row_version) !== pfiVersion_(x, h, l, wh)) pfiFail_('PFI_STALE_EXPORT');
        var fac = pmiS_(l.supplier_warehouse_id) || pmiS_(h.warehouse_id), fm = x.M.fmap[fac.toLowerCase()];
        if (!fm || fm.dup || fm.warehouseId !== wh || ['issued','confirmed','in_production','ready_to_ship','partial_completed','completed'].indexOf(pmiS_(h.order_status)) < 0) pfiFail_('PFI_PO_NOT_RECEIVABLE');
        if (pfiInt_(l.ordered_qty, true) === null || pfiInt_(l.completed_qty) === null || pfiInt_(l.shipped_qty) === null) pfiFail_('PFI_PO_COUNTER_UNKNOWN');
        if (pfiInt_(l.remaining_qty) === null || Number(l.remaining_qty) !== Number(l.completed_qty) - Number(l.shipped_qty)) pfiFail_('PFI_PO_COUNTER_UNKNOWN', 'This PO line has inconsistent completed, shipped and remaining quantities. New PO rows are not affected; this existing line needs owner review.');
        if ((pmiS_(r.currency) && pmiS_(r.currency) !== pmiS_(h.currency)) || pmiDay_(r.order_date) !== pmiDay_(h.order_date) || pfiInt_(r.ordered_qty, true) !== Number(l.ordered_qty)) pfiFail_('PFI_PO_IDENTITY_CHANGED');
        if (declared && pending !== Number(l.ordered_qty) - Number(l.completed_qty) - q) pfiFail_('PFI_UNPRODUCED_EXISTING_MISMATCH', 'For an existing PO, unproduced_qty must equal ordered_qty - completed_qty - this receipt quantity; historical counters cannot be rewritten.');
        var ev = poReceiptEvaluateLine_({ sku: sku, supplierWarehouseId: wh, warehouse: { isFactory: true, isActive: true }, ordered: l.ordered_qty, completed: l.completed_qty, shipped: l.shipped_qty, recvQtyRaw: q });
        if (ev.status !== 'apply') pfiFail_('PFI_RECEIPT_QUANTITY_INVALID', JSON.stringify(ev));
        var gate = poRcvGate_(ss, x.M.T.pol.sheet.getDataRange().getValues(), x.M.T.pol.headers,
          [{ status: 'apply', lineId: l.purchase_order_line_id, row: l.__r, sku: sku, warehouseId: wh }], x.rd.mv, x.rd.st, x.stock.sheet, ss.getSheetByName('factory_stock_movements'), h.purchase_order_id, h.updated_at);
        if (gate) pfiFail_(gate.code, gate.text);
        var hb12 = poRcvHeaderWriteBlock_(ss, h.purchase_order_id, h.updated_at); if (hb12) pfiFail_(hb12.code, hb12.error);   // PG12R3 (B-0)
        existing.push({ h: h, l: l, completed: ev.newCompleted, remaining: ev.newRemaining });
      } else {
        if (pmiS_(r.purchase_order_line_id) || pmiS_(r.row_version)) pfiFail_('PFI_NEW_PO_WITH_EXISTING_ID');
        var hk = co.value + '|' + no, header = { company: co.value, po_no: no, warehouse_id: wh, currency: pmiS_(r.currency), order_date: pmiDay_(r.order_date), order_status: 'issued' };
        if (heads[hk] && JSON.stringify(heads[hk]) !== JSON.stringify(header)) pfiFail_('PFI_PO_HEADER_CONFLICT'); heads[hk] = header;
        var ordered = pfiInt_(r.ordered_qty, true);
        if (ordered === null || q > ordered) pfiFail_('PFI_RECEIPT_QUANTITY_INVALID');
        var consumed = declared ? ordered - pending - q : 0;
        if (consumed > 0 && typeof slaFactoryImportConsumed_ !== 'function') pfiFail_('PFI_CONSUMED_RULE_NOT_DEPLOYED', 'Update 32_ and 82_ together before importing historical consumed units.');
        if (declared) productionPreview.push({ sheet: 'StockPO', row: r.__row, key: lk, action: 'create', ordered_qty: ordered, stock_receipt_qty: q, unproduced_qty: pending, historical_consumed_qty: consumed });
        lines.push({ company: co.value, po_no: no, sku: sku, ordered_qty: ordered, completed_qty: 0, opening_shipped_qty: 0, note: pmiS_(r.note), __quantity: q, __consumed: consumed });
      }
    });
    issueRow = null;
    var poPlan = { mode: req.mode, appends: [], cells: [] };
    if (lines.length) {
      // Only this quantity-only adapter may leave a new PO's currency unknown.
      var pr = pmiValidate_(ss, { id: req.id, mode: 'ADD_NEW', _pfiQuantityOnly: true, scope: { warehouse_id: wh, as_of_date: effectiveDay }, sheets: { Header: Object.keys(heads).map(function (k) { return heads[k]; }), Lines: lines.map(function (l) { var o = Object.assign({}, l); delete o.__quantity; delete o.__consumed; return o; }) } });
      if (pr.issues.length) return { issues: pr.issues, plan: null, preview: pr.preview, state: pr.state };
      poPlan = pr.plan;
      poPlan.appends.forEach(function (a) {
        if (a.table === 'purchase_orders') a.obj.source_type = 'po_factory_import';
        else {
          var source = lines.filter(function (l) { return l.company === a.obj.company && l.po_no === heads[l.company + '|' + l.po_no].po_no && l.sku === a.obj.sku; });
          // The generated parent ID disambiguates identical SKUs across different POs.
          source = source.filter(function (l) { var parent = poPlan.appends.filter(function (p) { return p.table === 'purchase_orders' && p.obj.po_no === l.po_no && p.obj.company === l.company; })[0]; return parent && parent.id === a.obj.purchase_order_id; });
          if (source.length !== 1) pfiFail_('PFI_PLAN_MAPPING_UNKNOWN');
          var q = source[0].__quantity, consumed = source[0].__consumed;
          a.obj.completed_qty = q + consumed; a.obj.shipped_qty = consumed; a.obj.remaining_qty = q;
          a.obj.opening_completed_qty = consumed > 0 ? q + consumed : (req.mode === 'OPENING_PO_FOR_EXISTING_STOCK' ? q : 0);
          a.obj.opening_shipped_qty = consumed; a.obj.opening_lineage_qty = 0; a.obj.opening_reconcile_status = 'RECONCILED';
        }
      });
      poPlan.appends.filter(function (a) { return a.table === 'purchase_orders'; }).forEach(function (a) {
        var ls = poPlan.appends.filter(function (l) { return l.table === 'purchase_order_lines' && l.obj.purchase_order_id === a.id; });
        a.obj.order_status = ls.every(function (l) { return l.obj.completed_qty === l.obj.ordered_qty; }) ? 'completed' : (ls.some(function (l) { return l.obj.completed_qty > 0; }) ? 'partial_completed' : 'issued');
        if (req.mode === 'NEW_RECEIPT' && a.obj.order_status === 'completed') { a.obj.completed_by = '$ACTOR'; a.obj.completed_at = '$NOW'; }
      });
    }
    function cell(T, row, field, value, id) {
      var c = T.col(field); if (c < 0) pfiFail_('PFI_COLUMN_MISSING', T.name + '.' + field);
      poPlan.cells.push({ table: T.name, row: row.__r, col: c, value: value, change: { entity_table: T.name, entity_id: id, line_id: T.name === 'purchase_order_lines' ? id : '', field: field, before: row[field], after: value } });
    }
    var changedHeads = {};
    existing.forEach(function (e) {
      ['completed_qty','remaining_qty','updated_at'].forEach(function (k) { cell(x.M.T.pol, e.l, k, k === 'completed_qty' ? e.completed : k === 'remaining_qty' ? e.remaining : '$NOW', e.l.purchase_order_line_id); });
      changedHeads[e.h.purchase_order_id] = e.h;
    });
    Object.keys(changedHeads).forEach(function (id) {
      var h = changedHeads[id], all = x.M.T.pol.rows.filter(function (l) { return pmiS_(l.purchase_order_id) === id; });
      var full = all.every(function (l) { var e = existing.filter(function (a) { return a.l.purchase_order_line_id === l.purchase_order_line_id; })[0]; return (e ? e.completed : Number(l.completed_qty)) === Number(l.ordered_qty); });
      cell(x.M.T.po, h, 'order_status', full ? 'completed' : 'partial_completed', id); cell(x.M.T.po, h, 'updated_at', '$NOW', id);
      cell(x.M.T.po, h, 'updated_by', '$ACTOR', id);
      if (full) { cell(x.M.T.po, h, 'completed_by', '$ACTOR', id); cell(x.M.T.po, h, 'completed_at', '$NOW', id); }
    });
    var expected = [], stockRows = [];
    Object.keys(keys).forEach(function (k) {
      var sku = k.slice(wh.length + 2), st = pfiStock_(x, wh, sku), info = req.mode === 'NEW_RECEIPT' ? pfiCoverageInfo_(x, wh, sku) : { known: true, quantity: pfiCoverage_(x, wh, sku) }, q = keys[k];
      if (req.mode === 'OPENING_PO_FOR_EXISTING_STOCK' && info.quantity + q !== st.current) pfiFail_('PFI_OPENING_COVERAGE_MISMATCH');
      var warning = pfiCoverageWarning_(info, st.current, wh, sku); if (warning) warnings.push(warning);
      expected.push({ warehouse_id: wh, sku: sku, current: st.current + (req.mode === 'NEW_RECEIPT' ? q : 0), reserved: st.reserved, coverage: info.known ? info.quantity + q : null, delta: req.mode === 'NEW_RECEIPT' ? q : 0 });
      if (req.mode === 'NEW_RECEIPT') stockRows.push({ warehouse_id: wh, sku: sku, add_qty: q });
    });
    var sp = { items: [] };
    if (stockRows.length) { var sv = imiFactoryValidate_(ss, { mode: 'ADD', scope: { warehouse_id: wh }, sheets: { Stock: stockRows } }); if (sv.issues.length) return { issues: sv.issues, plan: null, preview: sv.preview, state: sv.state }; sp = sv.plan; }
    return { issues: [], plan: { po: poPlan, stock: sp, expected: expected, effective_day: effectiveDay, rollback: pfiSnapshot_(ss) },
      state: pfiCanonical_({ effective_day: effectiveDay, po: x.M.T.po.rows, lines: x.M.T.pol.rows, stock: x.stock.rows, warehouses: x.M.T.wh.rows, skus: x.M.T.sku.rows, skipped: input.skipped, movements: x.rd.mv, headers: [x.M.T.po.headers,x.M.T.pol.headers,x.stock.headers] }),
      preview: { warnings: warnings, skipped: input.skipped, counts: { create: poPlan.appends.length, update: existing.length, reject: 0, skipped: input.skipped.unknown_sku }, rows: expected.map(function (e) { return Object.assign({ action: 'update', po_remaining_after: e.coverage }, e); }).concat(productionPreview),
        impacts: { receipt_opening_date: effectiveDay, stock_delta: req.mode === 'NEW_RECEIPT' ? Object.keys(keys).reduce(function (s,k) { return s + keys[k]; },0) : 0, reserved_delta: 0, documents: 0, emails: 0 } } };
  } catch (e) { issues.push({ sheet: 'StockPO', row: issueRow && issueRow.__row, code: e.importCode || 'PFI_VALIDATION_FAILED', message: (issueRow ? 'PO ' + pmiS_(issueRow.po_no) + ', SKU ' + pmiS_(issueRow.sku) + ': ' : '') + String(e.message || e) }); empty.preview.counts.reject = 1; return empty; }
}
function pfiValidateRemaining_(ss, req) {
  try {
    var x = pfiRead_(ss), wh = pfiFactory_(x, req.scope.warehouse_id), day = pmiS_(req.scope.as_of_date) || imbNow_().slice(0,10);
    if (!imbDate_(day) || Object.keys(req.scope).some(function (k) { return ['warehouse_id','as_of_date'].indexOf(k) < 0; })) pfiFail_('PFI_SCOPE_INVALID');
    var input = pfiInventoryRows_(req, x, wh), rows = input.rows;
    var allocations = pmiTable_(ss, 'shipment_line_allocations');
    if (!allocations || ['purchase_order_line_id','allocation_status','allocated_qty'].some(function (k) { return allocations.col(k) < 0; })) pfiFail_('PFI_ALLOCATION_UNREADABLE');
    var changes = [], newRows = [], seen = {}, delta = {}, changedHeads = {}, warnings = [], unchangedLegacy = 0, issueRow = null, trc12 = {};
    rows.forEach(function (r) {
      issueRow = r;
      if (Object.keys(r).some(function (k) { return k !== '__row' && PFI_FIELDS_.indexOf(k) < 0; })) pfiFail_('PFI_COLUMN_UNKNOWN');
      if (pmiS_(r.unproduced_qty) !== '') pfiFail_('PFI_UNPRODUCED_MODE_NOT_ALLOWED', 'unproduced_qty is declared only in New receipt; Update current data retains shipped history.');
      if (pmiS_(r.transaction_id) !== req.id) pfiFail_('PFI_TRANSACTION_ID_MISMATCH');
      if (pmiS_(r.warehouse_id) !== wh) pfiFail_('PFI_FACTORY_SCOPE_MISMATCH');
      var co = pmiCompany_(r.company), no = pmiS_(r.po_no), sku = pmiS_(r.sku), id = pmiS_(r.purchase_order_line_id);
      if ((co.code && !id) || !no || !x.M.sku[sku] || x.M.sku[sku].dup) pfiFail_('PFI_ROW_INVALID');
      if (!id) {
        if (pfiHeader_(x, co.value, no)) pfiFail_('PFI_NEW_ROW_REQUIRES_NEW_PO', 'A new row must use a new PO number; export existing lines to update them.');
        if (pmiS_(r.row_version)) pfiFail_('PFI_NEW_PO_WITH_EXISTING_ID');
        var nq = pfiInt_(r.quantity, true); if (nq === null) pfiFail_('PFI_ROW_INVALID');
        newRows.push(r); delta[sku] = (delta[sku] || 0) + nq;
        return;
      }
      if (seen[id]) pfiFail_('PFI_FILE_DUPLICATE_LINE'); seen[id] = true;
      var ls = x.M.T.pol.rows.filter(function (l) { return pmiS_(l.purchase_order_line_id) === id; });
      if (ls.length !== 1) pfiFail_('PFI_LINE_ID_REQUIRED');
      var l = ls[0], hs = x.M.T.po.rows.filter(function (h) { return pmiS_(h.purchase_order_id) === pmiS_(l.purchase_order_id); });
      if (hs.length !== 1) pfiFail_('PFI_PO_PARENT_UNKNOWN');
      var h = hs[0], fac = x.M.fmap[(pmiS_(l.supplier_warehouse_id) || pmiS_(h.warehouse_id)).toLowerCase()];
      if (!fac || fac.dup || fac.warehouseId !== wh || pmiS_(l.sku) !== sku || pmiS_(h.po_no) !== no) pfiFail_('PFI_LINE_ID_REQUIRED');
      if (['issued','confirmed','in_production','ready_to_ship','partial_completed','completed'].indexOf(pmiS_(h.order_status)) < 0) pfiFail_('PFI_PO_NOT_RECEIVABLE');
      if (!pmiS_(r.row_version) || pmiS_(r.row_version) !== pfiVersion_(x,h,l,wh)) pfiFail_('PFI_STALE_EXPORT');
      if ((pmiS_(r.currency) && pmiS_(r.currency) !== pmiS_(h.currency)) || pmiDay_(r.order_date) !== pmiDay_(h.order_date) || pfiInt_(r.ordered_qty,true) !== pfiInt_(l.ordered_qty,true)) pfiFail_('PFI_PO_IDENTITY_CHANGED');
      var q = pfiInt_(r.quantity), shipped = pfiInt_(l.shipped_qty), completed = pfiInt_(l.completed_qty), remaining = pfiInt_(l.remaining_qty), ordered = pfiInt_(l.ordered_qty,true);
      var storedCompany = pmiCompany_(pmiS_(l.company) || pmiS_(h.company));
      if (q !== null && q === remaining && (storedCompany.code || completed === null || shipped === null || remaining !== completed-shipped)) {
        if (!storedCompany.code && co.value !== storedCompany.value) pfiFail_('PFI_PO_IDENTITY_CHANGED');
        unchangedLegacy++;
        warnings.push({code:'PFI_UNCHANGED_LEGACY_ROW',sku:sku,po_no:no,message:'Unchanged historical row left untouched. Its company and quantity were not updated; source data needs owner review.'});
        return;
      }
      if (pfiLineCompany_(h,l) !== co.value) pfiFail_('PFI_LINE_ID_REQUIRED');
      if (q === null || shipped === null || completed === null || remaining === null || ordered === null || remaining !== completed - shipped) pfiFail_('PFI_PO_COUNTER_UNKNOWN');
      if (q > ordered - shipped) pfiFail_('PFI_REMAINING_EXCEEDS_ORDERED');
      var held = 0;
      allocations.rows.filter(function (a) { return pmiS_(a.purchase_order_line_id) === id; }).forEach(function (a) {
        var status = pmiS_(a.allocation_status).toLowerCase();
        if (status === 'draft') { var qty = pfiInt_(a.allocated_qty); if (qty === null) pfiFail_('PFI_ALLOCATION_UNKNOWN');
          var tr12 = poDraftOccupancyTrace_(ss, trc12, a.shipment_line_id);   // PG12R3 / SCF1 P-1: the shared occupancy rule
          if (tr12.state === 'BLOCKED') pfiFail_('PFI_ALLOCATION_TRACE_BLOCKED', pmiS_(a.shipment_line_allocation_id) + ' ' + tr12.why);
          if (tr12.state === 'ORPHAN') warnings.push({ code: 'PFI_LEGACY_ORPHAN_DRAFT_NOT_HELD', shipment_line_allocation_id: pmiS_(a.shipment_line_allocation_id), shipment_id: tr12.shipment_id, qty: qty,
            message: 'A draft allocation of cancelled shipment ' + tr12.shipment_id + ' (no dispatch evidence) is not counted as held. The allocation row is left as it is.' });
          else held += qty; }
        else if (['executed','released'].indexOf(status) < 0) pfiFail_('PFI_ALLOCATION_UNKNOWN', pmiS_(a.shipment_line_allocation_id) + ' has allocation status "' + pmiS_(a.allocation_status) + '", which no writer of this system produces; nothing was written - the owner must review that row');   // JR4 decision table: terminal = executed (32_:501, 80_:617) or released (12_:1803) only
      });
      if (q < held) pfiFail_('PFI_BELOW_PO_ALLOCATION', 'Remaining quantity is below ' + held + ' units already allocated from this PO line.');
      if (q !== remaining) {   // PG12R3 (B-0): an unresolved UI receipt on this line or PO is refused here, never overwritten by the count
        var g12 = poRcvGate_(ss, x.M.T.pol.sheet.getDataRange().getValues(), x.M.T.pol.headers, [{ status: 'apply', lineId: l.purchase_order_line_id, row: l.__r, sku: sku, warehouseId: wh }],
          x.rd.mv, x.rd.st, x.stock.sheet, ss.getSheetByName('factory_stock_movements'), h.purchase_order_id, h.updated_at, { receiptOnly: true });   // the receipt part only
        if (g12) pfiFail_(g12.code, g12.text);
        var hb12u = poRcvHeaderWriteBlock_(ss, h.purchase_order_id, h.updated_at); if (hb12u) pfiFail_(hb12u.code, hb12u.error);
      }
      delta[sku] = (delta[sku] || 0) + q - remaining;
      changes.push({h:h,l:l,completed:shipped+q,remaining:q,changed:q!==remaining});
      if (q !== remaining) changedHeads[h.purchase_order_id] = h;
    });
    issueRow = null;
    var poPlan = {mode:req.mode,appends:[],cells:[]};
    if (newRows.length) {
      var fresh = pfiValidate_(ss, {id:req.id,mode:'NEW_RECEIPT',scope:req.scope,sheets:{StockPO:newRows}});
      if (fresh.issues.length) return fresh;
      poPlan = fresh.plan.po;
    }
    function cell(T,row,field,value,id) {
      var col = T.col(field); if (col < 0) pfiFail_('PFI_COLUMN_MISSING',T.name+'.'+field);
      poPlan.cells.push({table:T.name,row:row.__r,col:col,value:value,change:{entity_table:T.name,entity_id:id,line_id:T.name==='purchase_order_lines'?id:'',field:field,before:row[field],after:value}});
    }
    changes.filter(function (e) {return e.changed;}).forEach(function (e) {
      cell(x.M.T.pol,e.l,'completed_qty',e.completed,e.l.purchase_order_line_id);
      cell(x.M.T.pol,e.l,'remaining_qty',e.remaining,e.l.purchase_order_line_id);
      cell(x.M.T.pol,e.l,'updated_at','$NOW',e.l.purchase_order_line_id);
    });
    Object.keys(changedHeads).forEach(function (id) {
      var h = changedHeads[id], received = 0, full = x.M.T.pol.rows.filter(function (l) {return pmiS_(l.purchase_order_id)===id;}).every(function (l) {
        var edited=changes.filter(function (e) {return e.l.purchase_order_line_id===l.purchase_order_line_id;})[0];
        return (edited?edited.completed:Number(l.completed_qty))===Number(l.ordered_qty);
      });
      x.M.T.pol.rows.filter(function (l) {return pmiS_(l.purchase_order_id)===id;}).forEach(function (l) {
        var edited=changes.filter(function (e) {return e.l.purchase_order_line_id===l.purchase_order_line_id;})[0];
        received += edited?edited.completed:Number(l.completed_qty);
      });
      cell(x.M.T.po,h,'order_status',full?'completed':received>0?'partial_completed':'in_production',id);
      cell(x.M.T.po,h,'updated_at','$NOW',id); cell(x.M.T.po,h,'updated_by','$ACTOR',id);
    });
    var expected=[], stockRows=[];
    Object.keys(delta).forEach(function (sku) {
      var st=pfiStock_(x,wh,sku), info=pfiCoverageInfo_(x,wh,sku), after=st.current+delta[sku];
      var warning=pfiCoverageWarning_(info,st.current,wh,sku); if(warning) warnings.push(warning);
      if (pfiInt_(after)===null) pfiFail_('PFI_QUANTITY_OVERFLOW');
      if (after<st.reserved) pfiFail_('PFI_BELOW_RESERVED','Target stock '+after+' is below reserved '+st.reserved+'.');
      expected.push({warehouse_id:wh,sku:sku,current:after,reserved:st.reserved,coverage:info.known?info.quantity+delta[sku]:null,delta:delta[sku]});
      stockRows.push({warehouse_id:wh,sku:sku,current_stock_qty:after});
    });
    var stock=stockRows.length?imiFactoryValidate_(ss,{mode:'SET',scope:{warehouse_id:wh},sheets:{Stock:stockRows}}):{issues:[],plan:{items:[]}};
    if (stock.issues.length) return {issues:stock.issues,plan:null,preview:stock.preview,state:stock.state};
    return {issues:[],plan:{po:poPlan,stock:stock.plan,expected:expected,effective_day:day,rollback:pfiSnapshot_(ss)},
      state:pfiCanonical_({effective_day:day,po:x.M.T.po.rows,lines:x.M.T.pol.rows,stock:x.stock.rows,warehouses:x.M.T.wh.rows,skus:x.M.T.sku.rows,skipped:input.skipped,movements:x.rd.mv,allocations:allocations.rows,headers:[x.M.T.po.headers,x.M.T.pol.headers,x.stock.headers]}),
      preview:{warnings:warnings,skipped:input.skipped,counts:{create:poPlan.appends.length,update:changes.filter(function(e){return e.changed;}).length,unchanged:unchangedLegacy+changes.filter(function(e){return !e.changed;}).length,reject:0,skipped:input.skipped.unknown_sku},
        rows:expected.map(function(e){return Object.assign({action:e.delta?'update':'unchanged',po_remaining_after:e.coverage},e);}),
        impacts:{receipt_opening_date:day,stock_delta:expected.reduce(function(s,e){return s+e.delta;},0),reserved_delta:0,shipped_delta:0,documents:0,emails:0}}};
  } catch(e) {return {issues:[{sheet:'StockPO',row:issueRow&&issueRow.__row,code:e.importCode||'PFI_VALIDATION_FAILED',message:(issueRow?'PO '+pmiS_(issueRow.po_no)+', SKU '+pmiS_(issueRow.sku)+': ':'')+String(e.message||e)}],plan:null,preview:{rows:[],counts:{reject:1}},state:{}};}
}
function pfiVerifyPoWrites_(ss, plan) {
  var fields=['purchase_order_id','purchase_order_line_id','company','sku','ordered_qty','completed_qty','shipped_qty','remaining_qty','order_status','warehouse_id','supplier_warehouse_id','opening_completed_qty','opening_shipped_qty','opening_lineage_qty','opening_reconcile_status','import_batch_id','source_type'];
  function same(k,a,b) { return /_qty$/.test(k) ? pfiInt_(a)!==null&&pfiInt_(a)===pfiInt_(b) : pmiS_(a)===pmiS_(b); }
  (plan.appends||[]).forEach(function(a){
    var t=pmiTable_(ss,a.table),key=a.table==='purchase_orders'?'purchase_order_id':'purchase_order_line_id';
    var found=t.rows.filter(function(r){return pmiS_(r[key])===pmiS_(a.obj[key]);});
    if(found.length!==1||fields.some(function(k){return Object.prototype.hasOwnProperty.call(a.obj,k)&&!same(k,found[0][k],a.obj[k]);})) pfiFail_('PFI_PO_READBACK_MISMATCH');
  });
  (plan.cells||[]).forEach(function(c){
    if(fields.indexOf(c.change.field)<0) return;
    var actual=ss.getSheetByName(c.table).getRange(c.row,c.col+1).getValue();
    if(!same(c.change.field,actual,c.value)) pfiFail_('PFI_PO_READBACK_MISMATCH');
  });
}
// PG12R3 (G-2): 82_ writes completed_qty together with the line's updated_at ($NOW). Before any write, $NOW is moved on (up to 3 x 1 s) until
// it is strictly later than the updated_at of every PO line this import writes - as 13_'s receipt does - so 40 -> 80 -> 40 changes the
// receipt precondition (completed_qty, updated_at) even within one second. No later second -> PFI_CLOCK_NOT_ADVANCED before any write.
function pfiStrictNow_(ss, plan, ctx) {
  var ids = {}; ((plan && plan.po && plan.po.cells) || []).forEach(function (c) { if (c.table === 'purchase_order_lines' && c.change && c.change.line_id) ids[String(c.change.line_id)] = 1; });
  if (!Object.keys(ids).length) return;
  var sh = ss.getSheetByName('purchase_order_lines'); if (!sh) pfiFail_('PFI_COLUMN_MISSING', 'purchase_order_lines');
  var v = sh.getDataRange().getValues(), hh = v[0].map(function (x) { return String(x).trim(); }), ci = hh.indexOf('purchase_order_line_id'), cu = hh.indexOf('updated_at');
  if (ci < 0 || cu < 0) pfiFail_('PFI_COLUMN_MISSING', 'purchase_order_lines.updated_at');
  var cur = []; for (var r = 1; r < v.length; r++) if (ids[String(v[r][ci]).trim()] === 1) cur.push(v[r][cu]);
  var tzs = poRcvTzs_(ss);
  for (var t = 0; t < 4; t++) { if (cur.every(function (u) { return poStampAfter_(ctx.now, u, tzs); })) return; if (t < 3) { Utilities.sleep(1000); ctx.now = imbNow_(); } }
  pfiFail_('PFI_LINE_STAMP_IN_FUTURE', 'PFI_LINE_STAMP_IN_FUTURE: ' + pfiFutureText_(pfiFutureLines_(ss, plan, ctx.now)));   // JR2 (J-M1): the validate gate below refuses these first; this is the in-lock backstop
}
// JR2 (review J-M1): lines this file would write whose updated_at is 3 s or more after now are refused at VALIDATE (so also at the in-lock
// re-validation of commit): no batch row, no lock-held wait, code PFI_LINE_STAMP_IN_FUTURE naming each line and stamp. Nothing is corrected.
function pfiFutureLines_(ss, plan, cut) {
  var ids = {}; ((plan && plan.po && plan.po.cells) || []).forEach(function (c) { if (c.table === 'purchase_order_lines' && c.change && c.change.line_id) ids[String(c.change.line_id)] = 1; });
  if (!Object.keys(ids).length) return [];
  var sh = ss.getSheetByName('purchase_order_lines'); if (!sh) return [];
  var v = sh.getDataRange().getValues(), hh = v[0].map(function (x) { return String(x).trim(); }), ci = hh.indexOf('purchase_order_line_id'), cu = hh.indexOf('updated_at'), tzs = poRcvTzs_(ss), out = [];
  if (ci < 0 || cu < 0) return [];
  for (var r = 1; r < v.length; r++) { var id = String(v[r][ci]).trim(); if (ids[id] === 1 && !poStampAfter_(cut, v[r][cu], tzs)) out.push(poStampLineInfo_(id, v[r][cu], tzs)); /* JR2b (Owner B) */ }
  return out;
}
function pfiFutureText_(bad) { return 'PO line ' + bad.map(function (b) { return b.purchase_order_line_id + ' (updated_at ' + b.updated_at + ')'; }).join(', ') + ' carries a time stamp that is not earlier than now, so this import could not stamp it later. Nothing was written. Sending the file again will not help while that stamp is ahead of the clock; an owner must review that updated_at cell. Nothing was corrected automatically.' + poStampZoneNote_(bad); }
function pfiValidateJr2_(ss, req) {
  var v = pfiValidate_(ss, req) || {};
  if ((v.issues && v.issues.length) || !v.plan) return v;
  var bad = pfiFutureLines_(ss, v.plan, poStampFutureCut_(3));
  if (!bad.length) return v;
  return Object.assign({}, v, { issues: [{ sheet: 'StockPO', code: 'PFI_LINE_STAMP_IN_FUTURE', retry_safe: false, classification: 'STAMP_AHEAD_OF_CLOCK', lines: bad, message: pfiFutureText_(bad) }] });
}
function pfiApply_(ss, plan, ctx) {
  pfiStrictNow_(ss, plan, ctx);   // PG12R3 (G-2)
  var po = pmiApply_(ss, plan.po, ctx), stock = { movements: 0, total_delta: 0 };
  plan.stock.items.forEach(function (item) {
    var names = ['factory_stock','factory_stock_movements'], before = names.map(function (n) { return ss.getSheetByName(n).getLastRow(); });
    try {
      var result = imiFactoryApply_(ss, { items: [item] }, ctx).result;
      stock.movements += result.movements; stock.total_delta += result.total_delta;
    } catch (error) {
      // The legacy stock writer journals appends after the call returns. Cover a landed append whose response throws.
      names.forEach(function (n, i) {
        var sh = ss.getSheetByName(n), covered = ctx.journal.entries.some(function (e) { return e.sheet && e.sheet.getName() === n && (e.kind === 'row' || e.kind === 'rows') && e.row > before[i]; });
        if (!covered) imbJournalLanded_(ctx.journal.entries, sh, before[i], 1);
      });
      throw error;
    }
  });
  SpreadsheetApp.flush();
  pfiVerifyPoWrites_(ss,plan.po);
  var x = pfiRead_(ss);
  plan.expected.forEach(function (e) { var st = pfiStock_(x, e.warehouse_id, e.sku), info = pfiCoverageInfo_(x, e.warehouse_id, e.sku);
    if (st.current !== e.current || st.reserved !== e.reserved || (e.coverage!==null&&(!info.known||info.quantity!==e.coverage))) pfiFail_('PFI_READBACK_MISMATCH'); });
  return { result: { mode: ctx.mode, receipt_opening_date: plan.effective_day, po: po.result, stock: stock, synchronized: true, synchronization_scope: 'THIS_BATCH_DELTAS_ONLY_NOT_LEGACY_RECONCILIATION', readback_verified: true, documents: 0, emails: 0 } };
}
function pfiSnapshot_(ss) { return ['purchase_orders','purchase_order_lines','factory_stock','factory_stock_movements'].map(function (n) { return [n,ss.getSheetByName(n).getDataRange().getValues()]; }); }
function pfiVerifyRollback_(ss, plan) { return JSON.stringify(pfiSnapshot_(ss)) === JSON.stringify(plan.rollback); }
function pfiResidue_(ss, id, receipt) {
  var x = pfiRead_(ss), keys = {}, scope = JSON.parse(receipt.scope_key || '{}'), rows = [];
  x.M.T.pol.rows.filter(function (l) { return pmiS_(l.import_batch_id) === id; }).forEach(function (l) {
    var wh = pmiS_(l.supplier_warehouse_id) || pmiS_(scope.warehouse_id), sku = pmiS_(l.sku);
    keys[wh + '||' + sku] = { warehouse_id: wh, sku: sku };
  });
  Object.keys(keys).sort().forEach(function (key) {
    var k = keys[key], stock = pfiStock_(x, k.warehouse_id, k.sku), coverage = pfiCoverageInfo_(x, k.warehouse_id, k.sku);
    var moves = pmiTable_(ss, 'factory_stock_movements').rows;
    var history = moves.filter(function (m) { return pmiS_(m.warehouse_id) === k.warehouse_id && pmiS_(m.sku) === k.sku; }), latest = history[history.length - 1];
    rows.push({ warehouse_id: k.warehouse_id, sku: k.sku, stock_exists: stock.exists, current_stock: stock.current,
      po_remaining: coverage.known ? coverage.quantity : null, po_coverage_reason: coverage.code || '',
      stock_matches_po: coverage.known && stock.current === coverage.quantity,
      movement_exists: !!latest, ledger_matches_stock: !!latest && pfiInt_(latest.after_current_stock) === stock.current && pfiInt_(latest.after_reserved_stock) === stock.reserved });
  });
  return { verdict: 'OWNER_REVIEW_REQUIRED', receipt_status: pmiS_(receipt.status), read_only: true, writes_performed: 0, rows: rows,
    message: 'An unfinished import is not safe to replay. Compare PO balances, stock and movements before any manual repair. This read does not change the receipt.' };
}
function imbPoFactoryDomain_() { return { domain: 'po_factory_stock', schema_version: PFI_SCHEMA_, modes: PFI_MODES_, sheets: ['StockPO'], maxRows: PFI_MAX_INPUT_ROWS_,
  template: pfiTemplate_, validate: pfiValidateJr2_, apply: pfiApply_, verifyRollback: pfiVerifyRollback_, residue: pfiResidue_ }; }
