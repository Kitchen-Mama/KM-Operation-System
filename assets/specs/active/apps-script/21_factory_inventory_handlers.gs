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
