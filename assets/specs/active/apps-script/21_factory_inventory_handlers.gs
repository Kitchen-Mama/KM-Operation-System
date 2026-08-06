// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 21_factory_inventory_handlers.gs — Factory Inventory Adjustment (snapshot + movement, atomic)
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// ------------------------------------------------------------
// This is the FIRST factory stock adjustment/movement writer. Previously the only handler
// touching factory_stock was ensureFactoryStockBaseline_ (0-baseline init, no movement row).
// The dead placeholder `toggleFactoryStockEdit()` (frontend) is now replaced by a real
// Inventory Adjustment modal that calls action `adjustFactoryInventory` → this handler.
//
// Data model (finalized 2026-07-21):
//   factory_stock balance columns: fac_current_stock / fac_reserved_stock
//     (legacy current_stock / reserved_stock accepted as fallback until the live sheet is renamed).
//   available_factory_stock = fac_current_stock - fac_reserved_stock  (derived; NOT a stored column).
//
// Adjustment contract (user only specifies the NEW available; reserved is NEVER edited):
//   before_current_stock  = current fac_current_stock
//   before_reserved_stock = current fac_reserved_stock
//   before_available      = before_current_stock - before_reserved_stock
//   after_reserved_stock  = before_reserved_stock                      (unchanged — never touch reserved)
//   after_current_stock   = new_available + before_reserved_stock
//   qty                   = new_available - before_available           (signed; = after_current - before_current)
//   invariant: after_current_stock - after_reserved_stock === new_available
//
// Atomicity: a script lock serializes writers; all validation happens BEFORE any write; and if the
// movement append throws AFTER the snapshot cell was updated, the snapshot cell is reverted (manual
// rollback) so the two tables never diverge (acceptance case 7).
// ============================================================

/**
 * Manual Inventory Adjustment for one factory_stock row.
 * Input: warehouse_id, sku, new_available (integer >= 0), note (required), reference_id (optional), created_by.
 * Writes factory_stock (fac_current_stock only) + one factory_stock_movements row (movement_type='manual_adjustment')
 * in a single lock-guarded, rollback-safe operation.
 */
function handleAdjustFactoryInventory_(body) {
  body = body || {};
  var warehouseId = String(body.warehouse_id || '').trim();
  var sku = String(body.sku || '').trim();
  var note = body.note !== undefined ? String(body.note).trim() : '';
  var createdBy = String(body.created_by || 'operation-system').trim();
  var refIdIn = String(body.reference_id || '').trim();

  // ---- Validation (all BEFORE any write) ----
  if (!warehouseId) return jsonResponse_({ success: false, error: 'Missing warehouse_id' });
  if (!sku) return jsonResponse_({ success: false, error: 'Missing sku' });
  if (!note) return jsonResponse_({ success: false, error: 'Note is required' });

  var newRaw = String(body.new_available == null ? '' : body.new_available).trim();
  if (newRaw === '') return jsonResponse_({ success: false, error: 'Missing new_available' });
  if (!/^\d+$/.test(newRaw)) return jsonResponse_({ success: false, error: 'new_available must be a whole number >= 0' });
  var newAvailable = parseInt(newRaw, 10);
  if (newAvailable < 0) return jsonResponse_({ success: false, error: 'new_available cannot be negative' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stockSheet = ss.getSheetByName('factory_stock');
  if (!stockSheet) return jsonResponse_({ success: false, error: 'factory_stock sheet not found' });

  // factory_stock_movements: ensure it exists with canonical headers (additive; never renames/drops).
  var MOV_HEADERS = [
    'factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty',
    'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
    'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'
  ];
  var movSheet = fcWriteEnsureSheet_(ss, 'factory_stock_movements', MOV_HEADERS);
  fcWriteEnsureColumns_(movSheet, MOV_HEADERS);

  // ---- Locate the factory_stock row by warehouse_id + sku ----
  var stockData = stockSheet.getDataRange().getValues();
  var stockHeaders = stockData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var stCol = function(n) { return stockHeaders.indexOf(n); };
  // Canonical fac_* with legacy fallback (temporary until the live headers are renamed).
  var curCol = stockHeaders.indexOf('fac_current_stock'); if (curCol === -1) curCol = stockHeaders.indexOf('current_stock');
  var resCol = stockHeaders.indexOf('fac_reserved_stock'); if (resCol === -1) resCol = stockHeaders.indexOf('reserved_stock');
  if (stCol('warehouse_id') === -1 || stCol('sku') === -1 || curCol === -1 || resCol === -1) {
    return jsonResponse_({ success: false, error: 'factory_stock missing required columns (warehouse_id, sku, fac_current_stock/current_stock, fac_reserved_stock/reserved_stock)' });
  }

  var targetRow = -1;
  for (var r = 1; r < stockData.length; r++) {
    if (String(stockData[r][stCol('warehouse_id')] || '').trim() === warehouseId &&
        String(stockData[r][stCol('sku')] || '').trim() === sku) {
      targetRow = r + 1;
      break;
    }
  }
  if (targetRow === -1) {
    return jsonResponse_({ success: false, error: 'No factory_stock row found for warehouse_id + sku.' });
  }

  var beforeCurrent = Math.round(parseFloat(stockData[targetRow - 1][curCol]) || 0);
  var beforeReserved = Math.round(parseFloat(stockData[targetRow - 1][resCol]) || 0);
  var beforeAvailable = beforeCurrent - beforeReserved;

  // No-op guard: New Available == Current Available is rejected (must be a real change).
  if (newAvailable === beforeAvailable) {
    return jsonResponse_({ success: false, error: 'New Available equals Current Available (' + beforeAvailable + '); nothing to adjust.' });
  }

  var afterReserved = beforeReserved;                       // reserved is NEVER modified
  var afterCurrent = newAvailable + beforeReserved;
  var qty = newAvailable - beforeAvailable;                 // signed

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var referenceId = refIdIn || ('ADJ-' + now.replace(/-/g, '') + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 4).toUpperCase());
  var movementId = 'FSMV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);

  // ---- Serialize writers so a concurrent adjustment cannot interleave the read/update/append. ----
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) {
      return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.' });
    }
  } catch (e) {
    return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e) });
  }

  var wroteSnapshot = false;
  try {
    // 1) Update factory_stock (fac_current_stock only; reserved untouched) + timestamps.
    stockSheet.getRange(targetRow, curCol + 1).setValue(afterCurrent);
    if (stCol('last_transaction_at') !== -1) stockSheet.getRange(targetRow, stCol('last_transaction_at') + 1).setValue(now);
    if (stCol('updated_at') !== -1) stockSheet.getRange(targetRow, stCol('updated_at') + 1).setValue(now);
    SpreadsheetApp.flush();
    wroteSnapshot = true;

    // 2) Append the movement row (mapped by live header).
    var movObj = {
      factory_stock_movement_id: movementId,
      movement_date: now,
      sku: sku,
      warehouse_id: warehouseId,
      movement_type: 'manual_adjustment',
      qty: qty,
      related_entity_type: 'inventory_adjustment',
      related_entity_id: referenceId,
      before_current_stock: beforeCurrent,
      after_current_stock: afterCurrent,
      before_reserved_stock: beforeReserved,
      after_reserved_stock: afterReserved,
      note: note,
      created_by: createdBy,
      created_at: now
    };
    fcWriteAppendByHeader_(movSheet, movObj);
    SpreadsheetApp.flush();
  } catch (err) {
    // Rollback the snapshot cell(s) so the two tables never diverge.
    if (wroteSnapshot) {
      try {
        stockSheet.getRange(targetRow, curCol + 1).setValue(beforeCurrent);
        if (stCol('last_transaction_at') !== -1) stockSheet.getRange(targetRow, stCol('last_transaction_at') + 1).setValue(stockData[targetRow - 1][stCol('last_transaction_at')]);
        if (stCol('updated_at') !== -1) stockSheet.getRange(targetRow, stCol('updated_at') + 1).setValue(stockData[targetRow - 1][stCol('updated_at')]);
        SpreadsheetApp.flush();
      } catch (e2) {
        return jsonResponse_({ success: false, error: 'Movement write failed AND snapshot rollback failed: ' + (err && err.message ? err.message : err) + ' | rollback: ' + (e2 && e2.message ? e2.message : e2) });
      }
    }
    return jsonResponse_({ success: false, error: 'Movement write failed; snapshot rolled back. ' + (err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }

  // Invariant check (defensive; never throws to the caller).
  var invariantOk = (afterCurrent - afterReserved) === newAvailable;

  return jsonResponse_({
    success: true,
    data: {
      movement_id: movementId,
      reference_id: referenceId,
      warehouse_id: warehouseId,
      sku: sku,
      quantity: qty,
      before_available: beforeAvailable,
      after_available: newAvailable,
      before_current_stock: beforeCurrent,
      after_current_stock: afterCurrent,
      before_reserved_stock: beforeReserved,
      after_reserved_stock: afterReserved,
      invariant_ok: invariantOk
    }
  });
}

// ============================================================
// F0-HOTFIX-FI1 — Factory Inventory Initial Stock Import (SET_CURRENT_STOCK).
// Two thin actions: factoryInventory.import.validate (ZERO writes; server-computed preview) and
// factoryInventory.import.commit (atomic-validated write). Identity = warehouse_id + sku. No supplier,
// no marketplace, no site_sku. Reserved is NEVER written by import; available stays derived by the
// canonical owner (current - reserved). Missing rows are created mirroring ensureFactoryStockBaseline_
// defaults (fac_current_stock=imported, fac_reserved_stock=0, factory_stock_id='FS-'+wh+'-'+sku).
// Movement rows reuse the EXISTING factory_stock_movements schema (movement_type='inventory_import',
// related_entity_type='factory_inventory_import', related_entity_id=import_batch_id). Idempotency is
// per-row via related_entity_id lookup (existing field; no schema expansion). Exact Spreadsheet-ID gate,
// LockService, validate-before-mutate, and per-row compensation on audit-write failure.
// ============================================================

// __FIIMPORT_PURE_START__ (test extraction marker — do not remove)
var FII_MAX_ROWS_ = 5000;      // batch row-count guard
var FII_NOTE_MAX_ = 500;       // bounded note length

function factoryImportNormId_(v) { return String(v == null ? '' : v).trim(); }

// PURE batch evaluator — no SpreadsheetApp, no clock, no write. Given parsed rows + canonical context,
// returns { ok, mode, summary, previewRows, issues }. ATOMIC_BATCH_VALIDATION: any blocking issue ⇒
// ok:false and the caller writes NOTHING (no partial import of the valid rows). SET semantics only.
// ctx = { warehouseById:{ id:{warehouseId,warehouseCode,isActive,isFactory} }, skuSet:{ sku:true },
//         existingByKey:{ 'wh||sku':{current:int,reserved:int} } }
function factoryImportEvaluateBatch_(rows, ctx) {
  rows = Array.isArray(rows) ? rows : [];
  ctx = ctx || {};
  var whById = ctx.warehouseById || {}, skuSet = ctx.skuSet || {}, existing = ctx.existingByKey || {};

  var summary = { totalRows: rows.length, validRows: 0, invalidRows: 0, unchangedRows: 0, createRows: 0, updateRows: 0, duplicateRows: 0 };
  var preview = [], issues = [], blocking = false;

  if (rows.length > FII_MAX_ROWS_) {
    issues.push({ code: 'ROW_LIMIT_EXCEEDED', row: null, message: 'Row count ' + rows.length + ' exceeds the limit of ' + FII_MAX_ROWS_ + '.' });
    return { ok: false, mode: 'SET_CURRENT_STOCK', summary: summary, previewRows: [], issues: issues };
  }

  // Pass 1 — per-row field validation + identity resolution.
  var perRow = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var displayRow = (typeof r.__row === 'number') ? r.__row : (i + 1);
    var wh = factoryImportNormId_(r.warehouse_id), whCode = factoryImportNormId_(r.warehouse_code), sku = factoryImportNormId_(r.sku);
    var qtyRaw = String(r.current_stock_qty == null ? '' : r.current_stock_qty).trim();
    var note = String(r.note == null ? '' : r.note), effDate = factoryImportNormId_(r.effective_date);
    var rowIssues = [];

    if (!wh) rowIssues.push('WAREHOUSE_ID_REQUIRED');
    if (!sku) rowIssues.push('SKU_REQUIRED');
    if (qtyRaw === '') rowIssues.push('QTY_REQUIRED');              // blank is MISSING, not zero
    else if (!/^\d+$/.test(qtyRaw)) rowIssues.push('QTY_INVALID');  // negative / decimal / non-numeric → invalid
    if (effDate && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(effDate)) rowIssues.push('EFFECTIVE_DATE_INVALID');
    if (note.length > FII_NOTE_MAX_) rowIssues.push('NOTE_TOO_LONG');

    var whRec = wh ? whById[wh] : null;
    if (wh && !whRec) rowIssues.push('WAREHOUSE_NOT_FOUND');
    else if (whRec) {
      if (whRec.isActive === false) rowIssues.push('WAREHOUSE_INACTIVE');
      if (whRec.isFactory !== true) rowIssues.push('WAREHOUSE_NOT_FACTORY');
      if (whCode && whRec.warehouseCode && factoryImportNormId_(whCode) !== factoryImportNormId_(whRec.warehouseCode)) rowIssues.push('WAREHOUSE_ID_CODE_MISMATCH');
    }
    if (sku && !skuSet[sku]) rowIssues.push('SKU_NOT_FOUND');

    var qty = /^\d+$/.test(qtyRaw) ? parseInt(qtyRaw, 10) : null;
    perRow.push({ displayRow: displayRow, wh: wh, whCode: whCode, sku: sku, qty: qty, note: note, effDate: effDate, issues: rowIssues, duplicate: '' });
  }

  // Pass 2 — duplicate detection on warehouse_id + sku (identical ⇒ dedupe; conflicting ⇒ block the batch).
  var seen = {};
  for (var d = 0; d < perRow.length; d++) {
    var pr = perRow[d];
    if (!pr.wh || !pr.sku || pr.qty === null) continue;
    var key = pr.wh + '||' + pr.sku;
    if (!seen.hasOwnProperty(key)) { seen[key] = { qty: pr.qty, first: d }; }
    else if (seen[key].qty === pr.qty) { pr.duplicate = 'DUPLICATE_IDENTICAL_ROW'; }
    else { pr.issues.push('DUPLICATE_FACTORY_SKU_CONFLICT'); perRow[seen[key].first].issues.push('DUPLICATE_FACTORY_SKU_CONFLICT'); }
  }

  // Pass 3 — classify + build preview.
  for (var j = 0; j < perRow.length; j++) {
    var p = perRow[j];
    var key2 = (p.wh && p.sku) ? (p.wh + '||' + p.sku) : null;
    var ex = key2 ? existing[key2] : null;
    var beforeQty = ex ? ex.current : null;
    var status, writeAction = 'none';
    if (p.issues.length) {
      status = 'INVALID'; summary.invalidRows++; blocking = true;
      p.issues.forEach(function (code) { issues.push({ code: code, row: p.displayRow, warehouse_id: p.wh, sku: p.sku, message: code }); });
    } else if (p.duplicate === 'DUPLICATE_IDENTICAL_ROW') {
      status = 'DUPLICATE_IDENTICAL_ROW'; summary.duplicateRows++;   // deduped — written once via the first occurrence
    } else if (ex) {
      if (beforeQty === p.qty) { status = 'UNCHANGED'; summary.unchangedRows++; summary.validRows++; }
      else { status = 'UPDATE'; writeAction = 'update'; summary.updateRows++; summary.validRows++; }
    } else {
      status = 'CREATE'; writeAction = 'create'; summary.createRows++; summary.validRows++;
    }
    preview.push({
      row: p.displayRow, warehouse_id: p.wh, warehouse_code: p.whCode, sku: p.sku,
      existingCurrentStock: (beforeQty === null ? null : beforeQty),
      importedCurrentStock: (p.qty === null ? null : p.qty),
      difference: (beforeQty === null || p.qty === null) ? null : (p.qty - beforeQty),
      status: status, writeAction: writeAction, note: p.note, effectiveDate: p.effDate,
      issue: p.issues.length ? p.issues.join(',') : (p.duplicate || '')
    });
  }

  return { ok: !blocking, mode: 'SET_CURRENT_STOCK', summary: summary, previewRows: preview, issues: issues };
}
// __FIIMPORT_PURE_END__ (test extraction marker — do not remove)

function factoryImportTruthy_(v) {
  if (v === true) return true; if (v === false) return false;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y' || s === 'active';
}

// Build the canonical warehouse + sku context (existing factory_stock is merged from the stock resolver).
function factoryImportBuildContext_(ss) {
  var whById = {}, skuSet = {};
  var whSheet = ss.getSheetByName('warehouses');
  if (whSheet) {
    var wd = whSheet.getDataRange().getValues();
    var wh = wd[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iId = wh.indexOf('warehouse_id'), iCode = wh.indexOf('warehouse_code'), iAct = wh.indexOf('is_active'), iFac = wh.indexOf('is_factory_warehouse'), iStatus = wh.indexOf('status');
    for (var r = 1; r < wd.length; r++) {
      var id = String(wd[r][iId] || '').trim(); if (!id) continue;
      whById[id] = {
        warehouseId: id,
        warehouseCode: iCode >= 0 ? String(wd[r][iCode] || '').trim() : '',
        isActive: iAct >= 0 ? factoryImportTruthy_(wd[r][iAct]) : (iStatus >= 0 ? (String(wd[r][iStatus] || '').trim().toLowerCase() === 'active') : true),
        isFactory: iFac >= 0 ? factoryImportTruthy_(wd[r][iFac]) : false
      };
    }
  }
  var skuSheet = ss.getSheetByName('sku_details');
  if (skuSheet) {
    var sd = skuSheet.getDataRange().getValues();
    var iSku = sd[0].map(function (h) { return String(h).trim().toLowerCase(); }).indexOf('sku');
    if (iSku >= 0) for (var s2 = 1; s2 < sd.length; s2++) { var sk = String(sd[s2][iSku] || '').trim(); if (sk) skuSet[sk] = true; }
  }
  return { warehouseById: whById, skuSet: skuSet, existingByKey: {} };
}

// Resolve factory_stock: header column indices + { 'wh||sku': {rowNumber,current,reserved} }. NO auto-repair.
function factoryImportResolveStock_(ss) {
  var sheet = ss.getSheetByName('factory_stock');
  if (!sheet) return { error: 'factory_stock sheet not found' };
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var col = function (n) { return headers.indexOf(n); };
  var curCol = col('fac_current_stock'); if (curCol === -1) curCol = col('current_stock');
  var resCol = col('fac_reserved_stock'); if (resCol === -1) resCol = col('reserved_stock');
  var whCol = col('warehouse_id'), skuCol = col('sku');
  if (whCol === -1 || skuCol === -1 || curCol === -1) {
    return { error: 'factory_stock missing required columns (warehouse_id, sku, fac_current_stock/current_stock)' };
  }
  var byKey = {};
  for (var r = 1; r < data.length; r++) {
    var wh = String(data[r][whCol] || '').trim(), sku = String(data[r][skuCol] || '').trim();
    if (!wh || !sku) continue;
    byKey[wh + '||' + sku] = { rowNumber: r + 1, current: Math.round(parseFloat(data[r][curCol]) || 0), reserved: resCol >= 0 ? Math.round(parseFloat(data[r][resCol]) || 0) : 0 };
  }
  return { sheet: sheet, headers: data[0].map(function (h) { return String(h).trim(); }), lcHeaders: headers, curCol: curCol, resCol: resCol, whCol: whCol, skuCol: skuCol,
    idCol: col('factory_stock_id'), createdAtCol: col('created_at'), updatedAtCol: col('updated_at'), lastTxCol: col('last_transaction_at'), byKey: byKey };
}

// Stable per-import batch id. Accepts a client-supplied FII-YYYYMMDD-XXXX (so a retry reuses it); else generates.
function factoryImportBatchId_(provided) {
  var p = String(provided == null ? '' : provided).trim();
  if (/^FII-\d{8}-[A-Za-z0-9]{1,16}$/.test(p)) return p;
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  return 'FII-' + now + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}

// Shared prep: exact Spreadsheet-ID gate → resolve stock (fail-closed on missing columns; no repair) →
// build ctx (warehouses/sku + existing) → evaluate. Used by BOTH validate and commit (validate-before-mutate).
function factoryImportPrepare_(body) {
  body = body || {};
  var rows = Array.isArray(body.rows) ? body.rows : [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { if (typeof prodAssertDbTarget_ === 'function') prodAssertDbTarget_(ss, prodExpectedDbId_()); }
  catch (e) { return { error: 'WRONG_SPREADSHEET_TARGET' }; }   // RULE S0-5 fail-closed

  var stock = factoryImportResolveStock_(ss);
  if (stock.error) return { error: stock.error };               // no sheet/header auto-repair

  var ctx = factoryImportBuildContext_(ss);
  for (var k in stock.byKey) ctx.existingByKey[k] = { current: stock.byKey[k].current, reserved: stock.byKey[k].reserved };

  return { ss: ss, stock: stock, ctx: ctx, evalResult: factoryImportEvaluateBatch_(rows, ctx), importBatchId: factoryImportBatchId_(body.importBatchId) };
}

// VALIDATE — ZERO writes. Returns the server-computed preview + summary + issues.
function handleFactoryInventoryImportValidate_(body) {
  try {
    var res = factoryImportPrepare_(body);
    if (res.error) return jsonResponse_({ success: false, error: res.error });
    return jsonResponse_({ success: true, error: null, data: {
      importBatchId: res.importBatchId, mode: 'SET_CURRENT_STOCK',
      summary: res.evalResult.summary, previewRows: res.evalResult.previewRows, issues: res.evalResult.issues
    } });
  } catch (err) {
    return jsonResponse_({ success: false, error: 'Factory import validate failed: ' + (err && err.message ? err.message : err) });
  }
}

// Keys already committed under THIS batch id (per-row idempotency — resume-safe on retry).
function factoryImportCommittedKeys_(movSheet, batchId) {
  var out = {};
  var data = movSheet.getDataRange().getValues();
  if (!data.length) return out;
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var iRef = h.indexOf('related_entity_id'), iType = h.indexOf('related_entity_type'), iWh = h.indexOf('warehouse_id'), iSku = h.indexOf('sku');
  if (iRef < 0 || iWh < 0 || iSku < 0) return out;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iRef] || '').trim() !== batchId) continue;
    if (iType >= 0 && String(data[r][iType] || '').trim() !== 'factory_inventory_import') continue;
    out[String(data[r][iWh] || '').trim() + '||' + String(data[r][iSku] || '').trim()] = true;
  }
  return out;
}

function factoryImportMovObj_(batchId, p, beforeCurrent, afterCurrent, beforeReserved, now, createdBy) {
  return {
    factory_stock_movement_id: 'FSMV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8),
    movement_date: (p.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(p.effectiveDate)) ? p.effectiveDate : now,
    sku: p.sku, warehouse_id: p.warehouse_id, movement_type: 'inventory_import', qty: afterCurrent - beforeCurrent,
    related_entity_type: 'factory_inventory_import', related_entity_id: batchId,
    before_current_stock: beforeCurrent, after_current_stock: afterCurrent,
    before_reserved_stock: beforeReserved, after_reserved_stock: beforeReserved,
    note: p.note || '', created_by: createdBy, created_at: now
  };
}

// COMMIT — re-validates the whole batch (ATOMIC_BATCH_VALIDATION → zero writes on any block), then under a
// script lock re-reads factory_stock (drift), SETs fac_current_stock (reserved untouched), creates missing
// rows (baseline defaults), and appends one movement per CHANGED row. Per-row compensation on audit failure.
function handleFactoryInventoryImportCommit_(body) {
  var prep;
  try { prep = factoryImportPrepare_(body); }
  catch (err) { return jsonResponse_({ success: false, error: 'Factory import commit prep failed: ' + (err && err.message ? err.message : err) }); }
  if (prep.error) return jsonResponse_({ success: false, error: prep.error });

  var evalResult = prep.evalResult;
  if (!evalResult.ok) {
    return jsonResponse_({ success: false, error: 'BATCH_VALIDATION_FAILED', data: { importBatchId: prep.importBatchId, mode: 'SET_CURRENT_STOCK', summary: evalResult.summary, issues: evalResult.issues } });
  }

  var ss = prep.ss, batchId = prep.importBatchId;
  var MOV_HEADERS = [
    'factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty',
    'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
    'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'
  ];
  var movSheet = fcWriteEnsureSheet_(ss, 'factory_stock_movements', MOV_HEADERS);
  fcWriteEnsureColumns_(movSheet, MOV_HEADERS);

  var createdBy = String(body.created_by || 'operation-system').trim();
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e) }); }

  var createdRows = 0, updatedRows = 0, unchangedRows = 0, movementRows = 0, skippedIdempotent = 0;
  try {
    var stock = factoryImportResolveStock_(ss);                 // re-read inside the lock (drift check)
    if (stock.error) return jsonResponse_({ success: false, error: stock.error });
    var committedKeys = factoryImportCommittedKeys_(movSheet, batchId);

    var plan = evalResult.previewRows;
    for (var i = 0; i < plan.length; i++) {
      var p = plan[i];
      if (p.status === 'INVALID' || p.status === 'DUPLICATE_IDENTICAL_ROW') continue;   // dupes written once via first occurrence
      var key = p.warehouse_id + '||' + p.sku;
      if (committedKeys[key]) { skippedIdempotent++; continue; }
      var ex = stock.byKey[key] || null;
      var beforeCurrent = ex ? ex.current : 0, beforeReserved = ex ? ex.reserved : 0;
      var afterCurrent = p.importedCurrentStock, movObj = null;

      if (!ex) {
        var createObj = {};
        createObj[stock.headers[stock.whCol]] = p.warehouse_id;
        createObj[stock.headers[stock.skuCol]] = p.sku;
        createObj[stock.headers[stock.curCol]] = afterCurrent;
        if (stock.resCol >= 0) createObj[stock.headers[stock.resCol]] = 0;
        if (stock.idCol >= 0) createObj[stock.headers[stock.idCol]] = 'FS-' + p.warehouse_id + '-' + p.sku;
        if (stock.createdAtCol >= 0) createObj[stock.headers[stock.createdAtCol]] = now;
        if (stock.updatedAtCol >= 0) createObj[stock.headers[stock.updatedAtCol]] = now;
        fcWriteAppendByHeader_(stock.sheet, createObj);
        SpreadsheetApp.flush();
        createdRows++;
        if (afterCurrent !== beforeCurrent) movObj = factoryImportMovObj_(batchId, p, beforeCurrent, afterCurrent, beforeReserved, now, createdBy);
      } else if (beforeCurrent === afterCurrent) {
        unchangedRows++; continue;                              // no write, no false movement
      } else {
        stock.sheet.getRange(ex.rowNumber, stock.curCol + 1).setValue(afterCurrent);
        if (stock.lastTxCol >= 0) stock.sheet.getRange(ex.rowNumber, stock.lastTxCol + 1).setValue(now);
        if (stock.updatedAtCol >= 0) stock.sheet.getRange(ex.rowNumber, stock.updatedAtCol + 1).setValue(now);
        SpreadsheetApp.flush();
        updatedRows++;
        movObj = factoryImportMovObj_(batchId, p, beforeCurrent, afterCurrent, beforeReserved, now, createdBy);
      }

      if (movObj) {
        try { fcWriteAppendByHeader_(movSheet, movObj); SpreadsheetApp.flush(); movementRows++; }
        catch (mErr) {
          if (ex) { try { stock.sheet.getRange(ex.rowNumber, stock.curCol + 1).setValue(beforeCurrent); SpreadsheetApp.flush(); } catch (rbErr) {} }
          return jsonResponse_({ success: false, error: 'IMPORT_AUDIT_WRITE_FAILED', data: {
            importBatchId: batchId, committed: false, createdRows: createdRows, updatedRows: updatedRows, unchangedRows: unchangedRows, movementRows: movementRows, failedRow: p.row } });
        }
      }
    }
  } catch (err) {
    return jsonResponse_({ success: false, error: 'Factory import commit failed: ' + (err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }

  return jsonResponse_({ success: true, error: null, data: {
    command: 'factoryInventory.import.commit', importBatchId: batchId, committed: true, mode: 'SET_CURRENT_STOCK',
    createdRows: createdRows, updatedRows: updatedRows, unchangedRows: unchangedRows, movementRows: movementRows,
    skippedIdempotent: skippedIdempotent, failedRows: 0 } });
}
