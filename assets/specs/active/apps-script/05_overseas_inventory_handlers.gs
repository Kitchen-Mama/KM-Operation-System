// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 05_overseas_inventory_handlers.gs — overseas inventory import + adjust
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

// ========================================
// Overseas Inventory Snapshot Batch Import Handler
// ========================================

/**
 * Batch import / upsert overseas_inventory_snapshot rows.
 * CSV carries: warehouse_id, sku, available_stock, reserved_stock, damaged_stock,
 *              on_the_way_qty, on_the_way_eta, note.
 * company / country / warehouse_name / warehouse_type are NOT in the CSV — they are
 * resolved from the `warehouses` registry by warehouse_id (and are NOT written onto the
 * snapshot row; the snapshot only stores warehouse_id and joins warehouses at read time).
 *
 * Business key: warehouse_id + sku.
 * - Existing key -> update stock fields / on_the_way_eta / note / updated_at; preserve snapshot_id + site_sku.
 * - New key      -> create with snapshot_id = OISN-{8hex}.
 * Quantities must be numeric and >= 0; decimals are rounded UP (CEILING). Non-numeric -> row error.
 * warehouse_id must exist in `warehouses`. Header-validated before any write.
 * Snapshot-only refresh: this importer does NOT write overseas_inventory_movements rows.
 */
function handleImportOverseasInventorySnapshotBatch_(body) {
  var rows = body.rows;
  if (!rows || !rows.length) {
    return jsonResponse_({ success: false, error: 'No rows provided' });
  }

  var options = body.options || {};
  var createdBy = String(options.createdBy || body.created_by || 'operation-system').trim();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var snapSheet = ss.getSheetByName('overseas_inventory_snapshot');
  var whSheet = ss.getSheetByName('warehouses');
  if (!snapSheet) return jsonResponse_({ success: false, error: 'overseas_inventory_snapshot sheet not found' });
  if (!whSheet) return jsonResponse_({ success: false, error: 'warehouses sheet not found' });

  // Inventory namespace migration (2026-07-21): overseas snapshot columns are canonical `wh_*`. qtyFields
  // hold canonical names; WH_LEGACY_ maps each to its pre-migration name for TEMPORARY fallback (removed
  // once live overseas_inventory_snapshot headers are renamed + verified).
  var WH_LEGACY_ = {
    wh_available_stock: 'available_stock', wh_reserved_stock: 'reserved_stock',
    wh_damaged_stock: 'damaged_stock', wh_on_the_way_qty: 'on_the_way_qty', wh_on_the_way_eta: 'on_the_way_eta'
  };
  var qtyFields = ['wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock', 'wh_on_the_way_qty'];

  var snapData = snapSheet.getDataRange().getValues();
  var snapHeaders = snapData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var snCol = function(n) { return snapHeaders.indexOf(n); };
  // Prefer the canonical wh_ header; fall back to the legacy header until the live sheet is renamed.
  var snPref = function(canon) { var i = snapHeaders.indexOf(canon); return i !== -1 ? i : snapHeaders.indexOf(WH_LEGACY_[canon] || canon); };
  var snHas = function(canon) { return snPref(canon) !== -1; };
  var rowVal = function(row, canon) { var v = row[canon]; if (v === undefined || v === null || v === '') v = row[WH_LEGACY_[canon]]; return v; };

  var whData = whSheet.getDataRange().getValues();
  var whHeaders = whData[0].map(function(h) { return String(h).trim().toLowerCase(); });

  // --- Required-header validation (before any writes). wh_* accept canonical OR legacy header. ---
  var plainReq = ['snapshot_id', 'warehouse_id', 'sku', 'site_sku', 'note', 'created_at', 'updated_at'];
  var whReq = qtyFields.concat(['wh_on_the_way_eta']);
  var missingHeaders = [];
  plainReq.forEach(function(h) { if (snapHeaders.indexOf(h) === -1) missingHeaders.push('overseas_inventory_snapshot.' + h); });
  whReq.forEach(function(h) { if (!snHas(h)) missingHeaders.push('overseas_inventory_snapshot.' + h + ' (or legacy ' + WH_LEGACY_[h] + ')'); });
  if (whHeaders.indexOf('warehouse_id') === -1) missingHeaders.push('warehouses.warehouse_id');
  if (missingHeaders.length) {
    return jsonResponse_({ success: false, error: 'Missing required header(s): ' + missingHeaders.join(', ') });
  }

  // --- warehouses: set of valid warehouse_id ---
  var wh_id = whHeaders.indexOf('warehouse_id');
  var validWarehouses = {};
  for (var w = 1; w < whData.length; w++) {
    var wid = String(whData[w][wh_id] || '').trim();
    if (wid) validWarehouses[wid] = true;
  }

  // --- existing snapshot business-key map (warehouse_id|sku) ---
  var sn_wh = snCol('warehouse_id'), sn_sku = snCol('sku');
  var bkToRow = {};
  for (var r = 1; r < snapData.length; r++) {
    var rwh = String(snapData[r][sn_wh] || '').trim();
    var rsku = String(snapData[r][sn_sku] || '').trim();
    if (!rwh || !rsku) continue;
    var k0 = rwh + '|' + rsku;
    if (bkToRow[k0] === undefined) {
      bkToRow[k0] = { row: r + 1, snapshotId: snCol('snapshot_id') !== -1 ? String(snapData[r][snCol('snapshot_id')] || '').trim() : '' };
    }
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var results = [];
  var batchSeen = {};

  for (var idx = 0; idx < rows.length; idx++) {
    var row = rows[idx] || {};
    var rowIndex = idx + 1;
    var warehouseId = String(row.warehouse_id || '').trim();
    var sku = String(row.sku || '').trim();
    var baseResult = { rowIndex: rowIndex, warehouse_id: warehouseId, sku: sku };

    var miss = [];
    if (!warehouseId) miss.push('warehouse_id');
    if (!sku) miss.push('sku');
    if (miss.length) {
      results.push(Object.assign({}, baseResult, { status: 'error', message: 'Missing required: ' + miss.join(', '), snapshot_id: '' }));
      continue;
    }

    if (!validWarehouses[warehouseId]) {
      results.push(Object.assign({}, baseResult, { status: 'error', message: 'warehouse_id not found in warehouses', snapshot_id: '' }));
      continue;
    }

    // Numeric (>= 0, CEILING) validation for quantity fields.
    var qtyVals = {};
    var badQty = null;
    for (var qi = 0; qi < qtyFields.length; qi++) {
      var f = qtyFields[qi];
      var rawVal = rowVal(row, f);   // accept canonical wh_ or legacy input key
      var sv = String(rawVal == null ? '' : rawVal).trim();
      if (sv === '') { qtyVals[f] = 0; continue; }
      if (!/^\d+(\.\d+)?$/.test(sv)) { badQty = { field: f, val: sv }; break; }
      qtyVals[f] = Math.ceil(parseFloat(sv));
    }
    if (badQty) {
      results.push(Object.assign({}, baseResult, { status: 'error', message: 'Invalid (must be number >= 0): ' + badQty.field + '="' + badQty.val + '"', snapshot_id: '' }));
      continue;
    }

    var key = warehouseId + '|' + sku;
    if (batchSeen[key]) {
      results.push(Object.assign({}, baseResult, { status: 'skipped', message: 'Duplicate row in batch', snapshot_id: '' }));
      continue;
    }
    batchSeen[key] = true;

    var etaVal = String((rowVal(row, 'wh_on_the_way_eta')) || '').trim();
    var noteVal = row.note !== undefined ? String(row.note).trim() : '';
    var etaCi = snPref('wh_on_the_way_eta');

    var existing = bkToRow[key];
    if (existing && existing.row !== -1) {
      var tr = existing.row;
      qtyFields.forEach(function(f) { var ci = snPref(f); if (ci !== -1) snapSheet.getRange(tr, ci + 1).setValue(qtyVals[f]); });
      if (etaCi !== -1) snapSheet.getRange(tr, etaCi + 1).setValue(etaVal);
      if (row.note !== undefined && snCol('note') !== -1) snapSheet.getRange(tr, snCol('note') + 1).setValue(noteVal);
      if (snCol('updated_at') !== -1) snapSheet.getRange(tr, snCol('updated_at') + 1).setValue(now);
      results.push(Object.assign({}, baseResult, { status: 'updated', message: 'Snapshot updated', snapshot_id: existing.snapshotId }));
    } else {
      var sid = 'OISN-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
      var newRow = new Array(snapHeaders.length).fill('');
      if (snCol('snapshot_id') !== -1) newRow[snCol('snapshot_id')] = sid;
      if (snCol('warehouse_id') !== -1) newRow[snCol('warehouse_id')] = warehouseId;
      if (snCol('sku') !== -1) newRow[snCol('sku')] = sku;
      qtyFields.forEach(function(f) { var ci = snPref(f); if (ci !== -1) newRow[ci] = qtyVals[f]; });
      if (etaCi !== -1) newRow[etaCi] = etaVal;
      if (snCol('note') !== -1) newRow[snCol('note')] = noteVal;
      if (snCol('created_at') !== -1) newRow[snCol('created_at')] = now;
      if (snCol('updated_at') !== -1) newRow[snCol('updated_at')] = now;
      snapSheet.appendRow(newRow);
      bkToRow[key] = { row: -1, snapshotId: sid };
      results.push(Object.assign({}, baseResult, { status: 'created', message: 'Snapshot created', snapshot_id: sid }));
    }
  }

  var summary = { total: rows.length, created: 0, updated: 0, skipped: 0, error: 0 };
  results.forEach(function(x) { if (summary[x.status] !== undefined) summary[x.status]++; });
  return jsonResponse_({ success: true, data: { summary: summary, results: results } });
}

// ========================================
// Overseas Inventory Adjustment Handler (renamed 2026-07-23: "Manual Adjustment" -> "Inventory Adjustment")
// ========================================

/**
 * Inventory Adjustment for one overseas_inventory_snapshot row.
 * Input (preferred): warehouse_id, sku, new_available (integer >= 0), note (required), reference_id (optional), created_by.
 * Backward-compatible: adjustment_qty (signed integer) is still accepted when new_available is absent.
 *
 * Scope: adjusts ONLY the available_stock bucket (wh_available_stock). reserved / physical / damaged /
 *   on_the_way are NEVER modified (they are recorded unchanged on the movement's before/after columns).
 *   available_stock is the source-reported authority bucket (may be non-reconstructable) — see
 *   INVENTORY_TABLE_MAPPING_SPEC §overseas. We do NOT recompute physical from available.
 *
 * Movement (canonical, per user spec Part F):
 *   movement_type = 'manual_adjustment', movement_scope = 'available_stock',
 *   from_stock_type = '' (empty/nullable — allowed set: available|reserved|damaged|on_the_way|none),
 *   to_stock_type = 'available', reference_type = 'inventory_adjustment',
 *   reference_id = backend-generated ADJ-YYYYMMDD-XXXX (frontend never assembles ids/timestamps),
 *   source_module = 'overseas_inventory'.
 *
 * Atomicity: a script lock serializes writers; all validation happens BEFORE any write; and if the
 * movement append throws AFTER the snapshot cell was updated, the snapshot cell is reverted (manual
 * rollback) so the two tables never diverge (acceptance case 7).
 *
 * The snapshot row must already exist (created via Import). warehouse_name / company etc. are NOT
 * written onto the movement row — they join from `warehouses` by warehouse_id.
 */
function handleAdjustOverseasInventory_(body) {
  body = body || {};
  var warehouseId = String(body.warehouse_id || '').trim();
  var sku = String(body.sku || '').trim();
  var note = body.note !== undefined ? String(body.note).trim() : '';
  var createdBy = String(body.created_by || 'operation-system').trim();
  var refIdIn = String(body.reference_id || '').trim();

  if (!warehouseId) return jsonResponse_({ success: false, error: 'Missing warehouse_id' });
  if (!sku) return jsonResponse_({ success: false, error: 'Missing sku' });
  if (!note) return jsonResponse_({ success: false, error: 'Note is required' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var snapSheet = ss.getSheetByName('overseas_inventory_snapshot');
  var whSheet = ss.getSheetByName('warehouses');
  if (!snapSheet) return jsonResponse_({ success: false, error: 'overseas_inventory_snapshot sheet not found' });
  if (!whSheet) return jsonResponse_({ success: false, error: 'warehouses sheet not found' });

  // Ensure the movements sheet exists with the canonical (wh_*) headers; additive — never renames/drops.
  var OVS_MOV_HEADERS = [
    'movement_id', 'movement_date', 'warehouse_id', 'sku', 'site_sku',
    'movement_type', 'movement_scope', 'from_stock_type', 'to_stock_type',
    'wh_quantity', 'wh_quantity_before', 'wh_quantity_after',
    'wh_before_physical_stock', 'wh_after_physical_stock',
    'wh_before_reserved_stock', 'wh_after_reserved_stock',
    'wh_before_available_stock', 'wh_after_available_stock',
    'reference_type', 'reference_id', 'source_module', 'created_by', 'created_at', 'note'
  ];
  var movSheet = fcWriteEnsureSheet_(ss, 'overseas_inventory_movements', OVS_MOV_HEADERS);
  fcWriteEnsureColumns_(movSheet, OVS_MOV_HEADERS);

  // Validate warehouse exists.
  var whData = whSheet.getDataRange().getValues();
  var whHeaders = whData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var wh_id = whHeaders.indexOf('warehouse_id');
  if (wh_id === -1) return jsonResponse_({ success: false, error: 'warehouses.warehouse_id column not found' });
  var whExists = false;
  for (var w = 1; w < whData.length; w++) {
    if (String(whData[w][wh_id] || '').trim() === warehouseId) { whExists = true; break; }
  }
  if (!whExists) return jsonResponse_({ success: false, error: 'warehouse_id not found in warehouses' });

  // Locate snapshot row by warehouse_id + sku.
  var snapData = snapSheet.getDataRange().getValues();
  var snapHeaders = snapData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var snCol = function(n) { return snapHeaders.indexOf(n); };
  // Canonical wh_* with legacy fallback until the live sheet is renamed (temporary).
  var snAvail = snapHeaders.indexOf('wh_available_stock'); if (snAvail === -1) snAvail = snapHeaders.indexOf('available_stock');
  var snPhys = snapHeaders.indexOf('wh_physical_stock'); if (snPhys === -1) snPhys = snapHeaders.indexOf('physical_stock');
  var snRes = snapHeaders.indexOf('wh_reserved_stock'); if (snRes === -1) snRes = snapHeaders.indexOf('reserved_stock');
  if (snCol('warehouse_id') === -1 || snCol('sku') === -1 || snAvail === -1) {
    return jsonResponse_({ success: false, error: 'overseas_inventory_snapshot missing required columns (warehouse_id, sku, wh_available_stock/available_stock)' });
  }

  var targetRow = -1, siteSku = '', snapshotId = '';
  for (var r = 1; r < snapData.length; r++) {
    if (String(snapData[r][snCol('warehouse_id')] || '').trim() === warehouseId &&
        String(snapData[r][snCol('sku')] || '').trim() === sku) {
      targetRow = r + 1;
      siteSku = snCol('site_sku') !== -1 ? String(snapData[r][snCol('site_sku')] || '').trim() : '';
      snapshotId = snCol('snapshot_id') !== -1 ? String(snapData[r][snCol('snapshot_id')] || '').trim() : '';
      break;
    }
  }
  if (targetRow === -1) {
    return jsonResponse_({ success: false, error: 'No snapshot row found for warehouse_id + sku. Import the snapshot first.' });
  }

  var beforeAvailable = Math.round(parseFloat(snapData[targetRow - 1][snAvail]) || 0);   // wh_available_stock bucket
  var beforePhysical = snPhys !== -1 ? Math.round(parseFloat(snapData[targetRow - 1][snPhys]) || 0) : '';
  var beforeReserved = snRes !== -1 ? Math.round(parseFloat(snapData[targetRow - 1][snRes]) || 0) : '';

  // Resolve target available: prefer new_available; fall back to adjustment_qty (signed).
  var afterAvailable, adjustmentQty;
  var newRaw = String(body.new_available == null ? '' : body.new_available).trim();
  if (newRaw !== '') {
    if (!/^\d+$/.test(newRaw)) return jsonResponse_({ success: false, error: 'new_available must be a whole number >= 0' });
    afterAvailable = parseInt(newRaw, 10);
    if (afterAvailable < 0) return jsonResponse_({ success: false, error: 'new_available cannot be negative' });
    if (afterAvailable === beforeAvailable) {
      return jsonResponse_({ success: false, error: 'New Available equals Current Available (' + beforeAvailable + '); nothing to adjust.' });
    }
    adjustmentQty = afterAvailable - beforeAvailable;
  } else {
    var adjRaw = String(body.adjustment_qty == null ? '' : body.adjustment_qty).trim();
    if (adjRaw === '') return jsonResponse_({ success: false, error: 'Missing new_available (or adjustment_qty)' });
    if (!/^-?\d+$/.test(adjRaw)) return jsonResponse_({ success: false, error: 'adjustment_qty must be a whole number (may be negative)' });
    adjustmentQty = parseInt(adjRaw, 10);
    if (adjustmentQty === 0) return jsonResponse_({ success: false, error: 'adjustment_qty cannot be 0' });
    afterAvailable = beforeAvailable + adjustmentQty;
    if (afterAvailable < 0) {
      return jsonResponse_({ success: false, error: 'Resulting wh_available_stock would be negative (' + beforeAvailable + ' + ' + adjustmentQty + ' = ' + afterAvailable + ')' });
    }
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var referenceId = refIdIn || ('ADJ-' + now.replace(/-/g, '') + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 4).toUpperCase());
  var movementId = 'OVMV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);

  // Serialize writers so a concurrent adjustment cannot interleave the read/update/append.
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.' });
  } catch (e) {
    return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e) });
  }

  var wroteSnapshot = false;
  try {
    // 1) Update snapshot (available bucket only) + timestamps.
    snapSheet.getRange(targetRow, snAvail + 1).setValue(afterAvailable);
    if (snCol('last_movement_at') !== -1) snapSheet.getRange(targetRow, snCol('last_movement_at') + 1).setValue(now);
    if (snCol('updated_at') !== -1) snapSheet.getRange(targetRow, snCol('updated_at') + 1).setValue(now);
    SpreadsheetApp.flush();
    wroteSnapshot = true;

    // 2) Append the movement row (mapped by live header; wh_* canonical with legacy quantity fallback).
    var movHeaders = movSheet.getDataRange().getValues()[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var mvCol = function(n) { return movHeaders.indexOf(n); };
    var mvQty = movHeaders.indexOf('wh_quantity'); if (mvQty === -1) mvQty = movHeaders.indexOf('quantity');
    var mvQtyB = movHeaders.indexOf('wh_quantity_before'); if (mvQtyB === -1) mvQtyB = movHeaders.indexOf('quantity_before');
    var mvQtyA = movHeaders.indexOf('wh_quantity_after'); if (mvQtyA === -1) mvQtyA = movHeaders.indexOf('quantity_after');
    var movRow = new Array(movHeaders.length).fill('');
    var setMv = function(name, val) { var i = mvCol(name); if (i !== -1) movRow[i] = val; };
    setMv('movement_id', movementId);
    setMv('movement_date', now);
    setMv('warehouse_id', warehouseId);
    setMv('sku', sku);
    setMv('site_sku', siteSku);
    setMv('movement_type', 'manual_adjustment');
    setMv('movement_scope', 'available_stock');
    setMv('from_stock_type', '');          // empty/nullable per spec (source bucket not applicable)
    setMv('to_stock_type', 'available');
    if (mvQty !== -1) movRow[mvQty] = adjustmentQty;
    if (mvQtyB !== -1) movRow[mvQtyB] = beforeAvailable;
    if (mvQtyA !== -1) movRow[mvQtyA] = afterAvailable;
    setMv('wh_before_available_stock', beforeAvailable);
    setMv('wh_after_available_stock', afterAvailable);
    setMv('wh_before_physical_stock', beforePhysical);     // unchanged original
    setMv('wh_after_physical_stock', beforePhysical);       // same original
    setMv('wh_before_reserved_stock', beforeReserved);      // unchanged original
    setMv('wh_after_reserved_stock', beforeReserved);       // same original
    setMv('reference_type', 'inventory_adjustment');
    setMv('reference_id', referenceId);
    setMv('source_module', 'overseas_inventory');
    setMv('created_by', createdBy);
    setMv('created_at', now);
    setMv('note', note);
    movSheet.appendRow(movRow);
    SpreadsheetApp.flush();
  } catch (err) {
    if (wroteSnapshot) {
      try {
        snapSheet.getRange(targetRow, snAvail + 1).setValue(beforeAvailable);
        if (snCol('last_movement_at') !== -1) snapSheet.getRange(targetRow, snCol('last_movement_at') + 1).setValue(snapData[targetRow - 1][snCol('last_movement_at')]);
        if (snCol('updated_at') !== -1) snapSheet.getRange(targetRow, snCol('updated_at') + 1).setValue(snapData[targetRow - 1][snCol('updated_at')]);
        SpreadsheetApp.flush();
      } catch (e2) {
        return jsonResponse_({ success: false, error: 'Movement write failed AND snapshot rollback failed: ' + (err && err.message ? err.message : err) + ' | rollback: ' + (e2 && e2.message ? e2.message : e2) });
      }
    }
    return jsonResponse_({ success: false, error: 'Movement write failed; snapshot rolled back. ' + (err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }

  return jsonResponse_({
    success: true,
    data: {
      movement_id: movementId,
      reference_id: referenceId,
      snapshot_id: snapshotId,
      warehouse_id: warehouseId,
      sku: sku,
      quantity: adjustmentQty,
      quantity_before: beforeAvailable,
      quantity_after: afterAvailable,
      before_available: beforeAvailable,
      after_available: afterAvailable
    }
  });
}

