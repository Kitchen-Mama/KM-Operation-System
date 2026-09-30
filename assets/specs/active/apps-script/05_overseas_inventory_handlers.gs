// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 05_overseas_inventory_handlers.gs — overseas inventory import + adjust
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

// ========================================
// F1-INVENTORY-IMPORT-WAREHOUSE-SAFETY-R1 — canonical Overseas warehouse eligibility (identity hardening)
// ----------------------------------------------------------------------------------------------------
// Server-side re-validation is MANDATORY (the template dropdown is convenience only). An imported
// warehouse_id must be a canonical warehouse that is ACTIVE and NOT a Factory warehouse — a Factory
// warehouse_id is the Factory-Inventory import's exclusive domain, and admitting one here would write
// physical stock into the wrong pool and contaminate downstream allocation/planning. Reuses the SAME
// canonical classification fields as the Factory rule (is_active + is_factory_warehouse), inverted — it
// invents NO second warehouse-type model. Pure (no SpreadsheetApp/clock/write) so it is unit-testable.
// __OVSIMPORT_PURE_START__ (test extraction marker — do not remove)
function overseasImportTruthy_(v) {
  if (v === true) return true; if (v === false) return false;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y' || s === 'active';
}
// F1-7N-UX-INVENTORY-IMPORT-WAREHOUSE-SCOPE-GUARDS-R1 — execution/platform warehouse types that are NEVER an eligible
// Overseas/self planning-inventory target (canonical `warehouse_type`, never a name heuristic). FBA = platform
// fulfillment centre (shipment-execution destination); RETURN = returns FC; FACTORY = factory pool (own owner).
var OVS_EXEC_WH_TYPES_ = { FBA: 1, RETURN: 1, FACTORY: 1 };
// whRec = { isActive:bool, isFactory:bool, type:string } | null (null ⇒ not in warehouses). Returns an issue code or null.
function overseasImportWarehouseIssue_(whRec) {
  if (!whRec) return 'WAREHOUSE_NOT_FOUND';
  if (whRec.isActive === false) return 'WAREHOUSE_INACTIVE';
  if (whRec.isFactory === true) return 'WAREHOUSE_NOT_OVERSEAS';   // a Factory warehouse is not an eligible Overseas/3PL target
  var t = String(whRec.type == null ? '' : whRec.type).trim().toUpperCase();
  if (OVS_EXEC_WH_TYPES_[t]) return 'WAREHOUSE_NOT_OVERSEAS';      // FBA / RETURN / FACTORY execution FC — not an Overseas/3PL target
  return null;
}
function overseasImportWarehouseMessage_(code) {
  return code === 'WAREHOUSE_INACTIVE' ? 'warehouse is inactive (not an eligible target)'
    : code === 'WAREHOUSE_NOT_OVERSEAS' ? 'warehouse is an FBA / Factory / Return execution FC — not an eligible Overseas/3PL inventory target'
    : 'warehouse_id not found in warehouses';
}

// F1-UX-OVERSEAS-INVENTORY-SCOPED-IMPORT-R1 — server-side IMPORT SCOPE gate (PURE, fail-closed, whole-batch).
// A scoped import declares the selected { company, country, warehouse_id } context (the UI selection is part of the
// contract, NOT trusted from the CSV). BEFORE any mutation this proves: (1) the selected warehouse exists + is eligible
// (active, non-factory) — reusing overseasImportWarehouseIssue_; (2) the selected company/country match the canonical
// warehouses facts (never inferred, never CSV-authoritative); (3) EVERY row's warehouse_id equals the selected one
// (one file = one warehouse). Any mismatch fails the WHOLE batch (no partial import, no silent row rewrite).
// whRec (from warehouseById) = { isActive, isFactory, company, country }. Returns { ok:true } or
// { ok:false, code, message, details }. When scope.warehouse_id is absent the gate is a no-op (legacy per-row path).
function overseasImportEq_(a, b) { return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase(); }
function overseasImportScopeCheck_(rows, scope, warehouseById) {
  scope = scope || {};
  var selWh = String(scope.warehouse_id || '').trim();
  if (!selWh) return { ok: true };   // no declared scope → legacy per-row eligibility path (backward compatible)
  var rec = (warehouseById || {})[selWh] || null;
  var issue = overseasImportWarehouseIssue_(rec);
  if (issue) {
    return { ok: false, code: 'IMPORT_WAREHOUSE_SCOPE_INVALID', message: 'Selected warehouse invalid: ' + overseasImportWarehouseMessage_(issue) + ' (' + selWh + ')', details: { warehouse_id: selWh, issue: issue } };
  }
  var selCompany = String(scope.company || '').trim();
  var selCountry = String(scope.country || '').trim();
  if (selCompany && rec.company != null && String(rec.company).trim() !== '' && !overseasImportEq_(rec.company, selCompany)) {
    return { ok: false, code: 'IMPORT_WAREHOUSE_SCOPE_MISMATCH', message: 'Selected company "' + selCompany + '" does not match warehouse ' + selWh + ' (canonical company "' + rec.company + '")', details: { warehouse_id: selWh, expected_company: rec.company, actual_company: selCompany } };
  }
  if (selCountry && rec.country != null && String(rec.country).trim() !== '' && !overseasImportEq_(rec.country, selCountry)) {
    return { ok: false, code: 'IMPORT_WAREHOUSE_SCOPE_MISMATCH', message: 'Selected country "' + selCountry + '" does not match warehouse ' + selWh + ' (canonical country "' + rec.country + '")', details: { warehouse_id: selWh, expected_country: rec.country, actual_country: selCountry } };
  }
  for (var i = 0; i < (rows || []).length; i++) {
    var rwh = String((rows[i] || {}).warehouse_id || '').trim();
    if (rwh && rwh !== selWh) {
      return { ok: false, code: 'IMPORT_WAREHOUSE_SCOPE_MISMATCH', message: 'Row ' + (i + 1) + ' warehouse_id "' + rwh + '" does not match the selected warehouse "' + selWh + '". One import file = one warehouse.', details: { expected_warehouse_id: selWh, row_number: (i + 1), actual_warehouse_id: rwh } };
    }
  }
  return { ok: true };
}
// __OVSIMPORT_PURE_END__ (test extraction marker — do not remove)

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
 * - Existing key -> update stock fields / on_the_way_eta / note / updated_at; preserve overseas_inventory_id + site_sku.
 * - New key      -> create with overseas_inventory_id = OISN-{8hex} (legacy snapshot_id header still accepted).
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
  // The four quantity columns the snapshot holds. `qtyFields` remains the HEADER requirement (the sheet must
  // still carry all four); `qtyWritableFields` is what an import may write, and wh_reserved_stock is
  // deliberately not in it — S6-R4B §7, IMPORT_WRITES_RESERVED = NO.
  var qtyFields = ['wh_available_stock', 'wh_reserved_stock', 'wh_damaged_stock', 'wh_on_the_way_qty'];
  var qtyWritableFields = ['wh_available_stock', 'wh_damaged_stock', 'wh_on_the_way_qty'];

  var snapData = snapSheet.getDataRange().getValues();
  var snapHeaders = snapData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var snCol = function(n) { return snapHeaders.indexOf(n); };
  // F1-7M-B2-HOTFIX-OVERSEAS-IMPORT-IDENTITY-CONTRACT: canonical PERSISTED identity is overseas_inventory_id;
  // snapshot_id is a legacy READ-compatibility alias ONLY (the live production sheet renamed snapshot_id ->
  // overseas_inventory_id). No second persisted identity column is added; the id stays server-generated.
  var snIdCol = function() { var i = snapHeaders.indexOf('overseas_inventory_id'); return i !== -1 ? i : snapHeaders.indexOf('snapshot_id'); };
  // Prefer the canonical wh_ header; fall back to the legacy header until the live sheet is renamed.
  var snPref = function(canon) { var i = snapHeaders.indexOf(canon); return i !== -1 ? i : snapHeaders.indexOf(WH_LEGACY_[canon] || canon); };
  var snHas = function(canon) { return snPref(canon) !== -1; };
  var rowVal = function(row, canon) { var v = row[canon]; if (v === undefined || v === null || v === '') v = row[WH_LEGACY_[canon]]; return v; };

  var whData = whSheet.getDataRange().getValues();
  var whHeaders = whData[0].map(function(h) { return String(h).trim().toLowerCase(); });

  // --- Required-header validation (before any writes). wh_* accept canonical OR legacy header. ---
  // Identity (overseas_inventory_id, legacy snapshot_id) is validated separately via snIdCol — it is SERVER-generated,
  // never a user CSV field — so it is NOT in plainReq. Requiring the legacy `snapshot_id` header here previously
  // rejected the live production sheet (which uses overseas_inventory_id) and blocked every import.
  var plainReq = ['warehouse_id', 'sku', 'site_sku', 'note', 'created_at', 'updated_at'];
  var whReq = qtyFields.concat(['wh_on_the_way_eta']);
  var missingHeaders = [];
  plainReq.forEach(function(h) { if (snapHeaders.indexOf(h) === -1) missingHeaders.push('overseas_inventory_snapshot.' + h); });
  if (snIdCol() === -1) missingHeaders.push('overseas_inventory_snapshot.overseas_inventory_id (or legacy snapshot_id)');
  whReq.forEach(function(h) { if (!snHas(h)) missingHeaders.push('overseas_inventory_snapshot.' + h + ' (or legacy ' + WH_LEGACY_[h] + ')'); });
  if (whHeaders.indexOf('warehouse_id') === -1) missingHeaders.push('warehouses.warehouse_id');
  if (missingHeaders.length) {
    return jsonResponse_({ success: false, error: 'Missing required header(s): ' + missingHeaders.join(', ') });
  }

  // --- warehouses: canonical eligibility record per warehouse_id (identity hardening — active + non-factory) ---
  var wh_id = whHeaders.indexOf('warehouse_id');
  var wh_active = whHeaders.indexOf('is_active');
  var wh_factory = whHeaders.indexOf('is_factory_warehouse');
  var wh_type = whHeaders.indexOf('warehouse_type');   // FBA/RETURN/FACTORY execution FCs are rejected as Overseas targets
  var wh_status = whHeaders.indexOf('status');
  var wh_company = whHeaders.indexOf('company');   // scoped-import context: canonical company/country facts per warehouse
  var wh_country = whHeaders.indexOf('country');
  var warehouseById = {};
  for (var w = 1; w < whData.length; w++) {
    var wid = String(whData[w][wh_id] || '').trim();
    if (!wid) continue;
    warehouseById[wid] = {
      isActive: wh_active >= 0 ? overseasImportTruthy_(whData[w][wh_active]) : (wh_status >= 0 ? (String(whData[w][wh_status] || '').trim().toLowerCase() === 'active') : true),
      isFactory: wh_factory >= 0 ? overseasImportTruthy_(whData[w][wh_factory]) : false,
      type: wh_type >= 0 ? String(whData[w][wh_type] || '').trim() : '',
      company: wh_company >= 0 ? String(whData[w][wh_company] || '').trim() : '',
      country: wh_country >= 0 ? String(whData[w][wh_country] || '').trim() : ''
    };
  }

  // F1-UX-OVERSEAS-INVENTORY-SCOPED-IMPORT-R1 — server-side scope gate. When the request declares a selected
  // { company, country, warehouse_id } context (options.scope | scope), validate it against the canonical warehouses
  // facts and require EVERY row to belong to that ONE warehouse — BEFORE any mutation. Fail-closed for the whole batch
  // (no partial import, no silent row rewrite). Absent scope → legacy per-row eligibility path (backward compatible).
  var importScope = (options && options.scope) || body.scope || null;
  if (importScope) {
    var scopeGate = overseasImportScopeCheck_(rows, importScope, warehouseById);
    if (!scopeGate.ok) {
      return jsonResponse_({ success: false, error: scopeGate.message, code: scopeGate.code, details: scopeGate.details || null });
    }
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
      bkToRow[k0] = { row: r + 1, snapshotId: snIdCol() !== -1 ? String(snapData[r][snIdCol()] || '').trim() : '' };
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

    var whIssue = overseasImportWarehouseIssue_(warehouseById[warehouseId]);
    if (whIssue) {
      results.push(Object.assign({}, baseResult, { status: 'error', message: overseasImportWarehouseMessage_(whIssue), snapshot_id: '' }));
      continue;
    }

    /* S6-R4B §8 — NUMERIC VALIDATION, WITH PRESENCE PRESERVED.
     *
     * `qtyPresent[f]` is the whole change. Before this round a blank cell, an absent column and an operator
     * writing 0 all produced qtyVals[f] = 0 and all three were written, so "I did not mention damaged" and
     * "damaged is zero" were the same request and the second one always won. They are now distinguishable,
     * and §8's matrix says what each one means per field.
     *
     * wh_reserved_stock is EXCLUDED from this loop (§7). It is not validated, not collected and not written;
     * a source-supplied reserved value is simply not the KM reservation authority. */
    var qtyVals = {}, qtyPresent = {};
    var badQty = null;
    for (var qi = 0; qi < qtyWritableFields.length; qi++) {
      var f = qtyWritableFields[qi];
      var rawVal = rowVal(row, f);   // accept canonical wh_ or legacy input key
      var sv = String(rawVal == null ? '' : rawVal).trim();
      if (sv === '') { qtyPresent[f] = false; qtyVals[f] = 0; continue; }
      if (!/^\d+(\.\d+)?$/.test(sv)) { badQty = { field: f, val: sv }; break; }
      qtyPresent[f] = true;
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

      /* S6-R4B §6 — GROSS, AND THE GUARD BEFORE THE SUBTRACTION.
       *
       * The imported `available` is the SOURCE's figure, taken before KM's reservation exists (PART VI §40).
       * The canonical operational value is therefore S - R. When the source reports FEWER units than KM has
       * already committed there is no truthful post-import state, so the row is refused and nothing on it
       * moves — not clamped to zero, not reconciled by quietly reducing the reservation.
       *
       * The guard is evaluated FIRST. Subtracting and then flooring at zero would erase (R - S) reserved
       * units by arithmetic rather than by assignment, which is the same defect reached by a different route. */
      var canonReserved = 0;
      var resCi = snPref('wh_reserved_stock');
      if (resCi !== -1) canonReserved = Math.round(parseFloat(snapData[tr - 1][resCi]) || 0);
      if (qtyPresent['wh_available_stock'] && qtyVals['wh_available_stock'] < canonReserved) {
        results.push(Object.assign({}, baseResult, { status: 'error',
          code: 'IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE',
          message: 'Source available (' + qtyVals['wh_available_stock'] + ') is less than the reservation this ' +
            'system already holds (' + canonReserved + '). Nothing on this row was changed.',
          source_available: qtyVals['wh_available_stock'], canonical_reserved: canonReserved,
          snapshot_id: existing.snapshotId }));
        continue;   // §10 — ROW-level refusal. The batch continues; other rows import normally.
      }

      /* A blank or absent quantity writes NOTHING (§8). `wh_reserved_stock` is not in this list at all (§7),
       * so no import path can reach that cell. */
      qtyWritableFields.forEach(function(f) {
        if (!qtyPresent[f]) return;
        var ci = snPref(f);
        if (ci === -1) return;
        var v = qtyVals[f];
        if (f === 'wh_available_stock') v = qtyVals[f] - canonReserved;   // GROSS -> operational
        snapSheet.getRange(tr, ci + 1).setValue(v);
      });
      if (etaCi !== -1) snapSheet.getRange(tr, etaCi + 1).setValue(etaVal);
      if (row.note !== undefined && snCol('note') !== -1) snapSheet.getRange(tr, snCol('note') + 1).setValue(noteVal);
      if (snCol('updated_at') !== -1) snapSheet.getRange(tr, snCol('updated_at') + 1).setValue(now);
      results.push(Object.assign({}, baseResult, { status: 'updated', message: 'Snapshot updated', snapshot_id: existing.snapshotId }));
    } else {
      var sid = 'OISN-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
      var newRow = new Array(snapHeaders.length).fill('');
      if (snIdCol() !== -1) newRow[snIdCol()] = sid;
      if (snCol('warehouse_id') !== -1) newRow[snCol('warehouse_id')] = warehouseId;
      if (snCol('sku') !== -1) newRow[snCol('sku')] = sku;
      /* A NEW row holds no KM reservation, so R = 0 and the GROSS arithmetic S - R is simply S — the same
       * rule, not a special case. Reserved is INITIALIZED to 0 by row creation and is not read from the
       * payload (§7): a source-reported reserved on a SKU this system has never reserved would mint a KM
       * reservation that no lifecycle could ever release. */
      qtyWritableFields.forEach(function(f) { var ci = snPref(f); if (ci !== -1) newRow[ci] = qtyVals[f]; });
      var newResCi = snPref('wh_reserved_stock');
      if (newResCi !== -1) newRow[newResCi] = 0;
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

// ============================================================================================================
// S6-R4B — THE OVERSEAS RESERVATION LIFECYCLE.  __OVS_LIFECYCLE_START__  (test extraction marker)
// ------------------------------------------------------------------------------------------------------------
// This is the overseas analogue of 21_'s factory reservation transaction layer, and it is DELIBERATELY NOT the
// same arithmetic. The two domains store availability differently and the contract (PART V §31, PART VI §41)
// froze the difference:
//
//   FACTORY    available is DERIVED:  available = fac_current_stock - fac_reserved_stock
//              a reserve moves nothing; it raises reserved and available falls out of the subtraction.
//
//   OVERSEAS   available is STORED:   wh_available_stock IS the allocatable quantity
//              a reserve TRANSFERS:   available -= qty AND reserved += qty, together, in one row.
//
// So ALLOCATABLE_OVERSEAS_QTY = wh_available_stock, never wh_available_stock - wh_reserved_stock. Subtracting
// reserved a second time is the single most plausible wrong line in this file — the reserved units already left
// available when the reservation was acquired — and ovsAllocatableTx_ exists as the one place that arithmetic
// is written down, so a mutant can be pointed at it.
//
// wh_physical_stock takes no part in any of it (PART V §32). Every row below carries its before/after pair
// unchanged, which is a ledger truthfully recording that a bucket with no lifecycle did not move.
//
// THE JOURNAL IS THE SAME SHAPE 21_ USES — { kind:'cell', sheet, row, col, prev } and { kind:'row', sheet, row }
// — so factoryStockRollbackJournal_ undoes an overseas write as readily as a factory one. That is the whole
// composition: ONE journal and ONE rollback across two domains, rather than a second rollback that could
// disagree with the first about what "undo" means. 12_ therefore rolls a mixed transaction back atomically.
// ============================================================================================================

// S6-R4B — 05_'s FIRST build stamp. Before this round the file owned an importer and an adjustment handler,
// both of which either work or visibly do not. It now owns a reservation lifecycle that 12_ and 22_ CALL by
// name, so an old 05_ beside a new 12_ resolves ovsAcquireReservationTx_ to undefined and throws inside a
// journalled transaction — which is precisely the half-synced state a per-module stamp exists to expose.
var OVERSEAS_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R35';

var OVSTX_MOV_RESERVE_ACQUIRE_ = 'reservation_acquire';
var OVSTX_MOV_RESERVE_RELEASE_ = 'reservation_release';
var OVSTX_MOV_SHIPMENT_OUT_ = 'shipment_out';
var OVSTX_MOV_INVENTORY_IMPORT_ = 'inventory_import';
// S6-R6 — TWO MEMBERS THIS LEDGER ALREADY CARRIED AND DID NOT DECLARE.
//
// `manual_adjustment` is written to overseas_inventory_movements by this file's own adjustment handler
// and has been since long before R4B. `shipment_receipt` is written to the same table by 31_, the
// warehouse receipt, and was declared in 21_'s FACTORY list — where its own comment recorded that it
// moves no factory quantity and belongs to this table. Neither is new and neither is a synonym: they
// are existing events that the declared vocabulary did not name, which is the one way a 'closed'
// vocabulary can be wrong without anybody noticing.
var OVSTX_MOV_MANUAL_ADJUSTMENT_ = 'manual_adjustment';
var OVSTX_MOV_SHIPMENT_RECEIPT_ = 'shipment_receipt';

/* THE OVERSEAS LEDGER VOCABULARY. Every movement_type that may appear in overseas_inventory_movements.
 *
 * inventory_import is DECLARED BUT NOT YET WRITTEN: PART V §35 named it and the snapshot importer
 * updates balances without appending a movement row. It is kept rather than removed, because removing a
 * declaration R4B made deliberately is a decision about that round's contract and not this round's to
 * take — and because the importer growing a ledger row is a change to the writer, not to the meaning. */
var OVSTX_MOVEMENT_TYPES_ = [OVSTX_MOV_RESERVE_ACQUIRE_, OVSTX_MOV_RESERVE_RELEASE_,
  OVSTX_MOV_SHIPMENT_OUT_, OVSTX_MOV_INVENTORY_IMPORT_,
  OVSTX_MOV_MANUAL_ADJUSTMENT_, OVSTX_MOV_SHIPMENT_RECEIPT_];

/* WHAT THE SHARED TRANSACTION MAY EMIT — a STRICT SUBSET of the vocabulary above, and the guard
 * ovsApplyDeltaTx_ enforces.
 *
 * The guard used to be the vocabulary itself, which conflated two different questions: 'is this a real
 * overseas movement type' and 'may the reservation transaction write it'. Widening the first to cover
 * the receipt and the adjustment would have widened the second with it, and ovsApplyDeltaTx_ would have
 * accepted a request to book a warehouse receipt through the reservation path. Separating them makes
 * this guard STRICTER than it was: inventory_import was accepted here and no caller ever passes it. */
var OVSTX_TX_WRITABLE_TYPES_ = [OVSTX_MOV_RESERVE_ACQUIRE_, OVSTX_MOV_RESERVE_RELEASE_,
  OVSTX_MOV_SHIPMENT_OUT_];
/* THE TYPES WHOSE wh_quantity IS A RESERVED DELTA — and this list differs from 21_'s on purpose.
 *
 * 21_ EXCLUDES shipment_out from the FACTORY per-owner ledger, because a factory dispatch row's `qty` is the
 * CURRENT-stock delta and its reservation release is carried only by that row's before/after reserved pair;
 * summing `qty` there would add a physical movement to a reservation total.
 *
 * An overseas dispatch is not that shape. It moves ONLY reserved, so its wh_quantity IS the reserved delta
 * (-take), exactly as on acquire (+q) and release (-q). Excluding it left a consumed hold looking
 * outstanding for ever: a second dispatch found the hold still standing against a reserved balance of zero
 * and threw inside a journalled transaction instead of answering NO_RESERVATION. §21 case O caught it.
 *
 * The INVARIANT is 21_'s — the ledger must reconstruct the reserved balance. The membership follows from
 * THIS domain's row shape rather than from that one's exclusion list, which is what I copied first. */
var OVSTX_RESERVED_AXIS_TYPES_ = [OVSTX_MOV_RESERVE_ACQUIRE_, OVSTX_MOV_RESERVE_RELEASE_,
  OVSTX_MOV_SHIPMENT_OUT_];
var OVSTX_RESERVATION_OWNER_TYPE_ = 'shipment';
var OVSTX_SOURCE_MODULE_ = 'overseas_inventory';

/** Resolve the snapshot's columns once, canonical wh_* with the temporary legacy fallback. */
function ovsStockColsTx_(headerRow) {
  var H = (headerRow || []).map(function (h) { return String(h).trim().toLowerCase(); });
  function pick(canon, legacy) { var i = H.indexOf(canon); return i !== -1 ? i : H.indexOf(legacy); }
  return {
    H: H,
    wh: H.indexOf('warehouse_id'), sku: H.indexOf('sku'), siteSku: H.indexOf('site_sku'),
    avail: pick('wh_available_stock', 'available_stock'),
    res: pick('wh_reserved_stock', 'reserved_stock'),
    phys: pick('wh_physical_stock', 'physical_stock'),
    lastMov: H.indexOf('last_movement_at'), updatedAt: H.indexOf('updated_at'),
    id: (function () { var i = H.indexOf('overseas_inventory_id'); return i !== -1 ? i : H.indexOf('snapshot_id'); })()
  };
}

/**
 * The (warehouse_id, sku) balance. A missing row reads as all-zero rather than throwing: "no row" and "zero
 * stock" are the same availability fact, and the caller's job is to refuse on availability, not on row
 * presence. Mirrors factoryStockReadBalanceTx_'s contract so the two domains answer the same SHAPE.
 */
function ovsStockReadBalanceTx_(snapSheet, warehouseId, sku) {
  warehouseId = String(warehouseId == null ? '' : warehouseId).trim();
  sku = String(sku == null ? '' : sku).trim();
  var data = snapSheet.getDataRange().getValues();
  var C = ovsStockColsTx_(data[0]);
  if (C.wh === -1 || C.sku === -1 || C.avail === -1) {
    throw new Error('ovsStockReadBalanceTx_: overseas_inventory_snapshot missing required columns');
  }
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][C.wh] || '').trim() !== warehouseId) continue;
    if (String(data[r][C.sku] || '').trim() !== sku) continue;
    return {
      found: true, row: r + 1,
      available: Math.round(parseFloat(data[r][C.avail]) || 0),
      reserved: C.res === -1 ? 0 : Math.round(parseFloat(data[r][C.res]) || 0),
      physical: C.phys === -1 ? '' : data[r][C.phys]
    };
  }
  return { found: false, row: -1, available: 0, reserved: 0, physical: '' };
}

/**
 * S6-R3A §31 / R4B §5 — THE ALLOCATABLE QUANTITY, IN ONE PLACE.
 *
 * It is the stored available bucket and nothing else. Writing `bal.available - bal.reserved` here would hold
 * the reserved units against the pool a SECOND time: they left `available` when the reservation was acquired,
 * so subtracting them again reports 40 allocatable on a 70/30 pool that genuinely has 70.
 */
function ovsAllocatableTx_(bal) {
  return Math.round(Number((bal && bal.available) || 0));
}

/**
 * The per-owner reservation ledger for ONE owner: { 'warehouse_id||sku': netHeldQty }.
 *
 * This is simultaneously the lifecycle status and the idempotency check — the same property 21_ relies on, and
 * the reason §16 needs no new column. A replayed acquire sees its own earlier row and applies nothing; a
 * release can never exceed what this owner actually holds.
 */
function ovsOwnerReservedTx_(movSheet, ownerType, ownerId) {
  var out = {};
  ownerType = String(ownerType == null ? '' : ownerType).trim();
  ownerId = String(ownerId == null ? '' : ownerId).trim();
  if (!ownerId) return out;
  var data = movSheet.getDataRange().getValues();
  var H = (data[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
  var tC = H.indexOf('movement_type'), wC = H.indexOf('warehouse_id'), sC = H.indexOf('sku');
  var qC = H.indexOf('wh_quantity'); if (qC === -1) qC = H.indexOf('quantity');
  var rtC = H.indexOf('reference_type'), riC = H.indexOf('reference_id');
  if (tC === -1 || qC === -1 || wC === -1 || sC === -1 || riC === -1) return out;
  for (var r = 1; r < data.length; r++) {
    var t = String(data[r][tC] || '').trim();
    if (OVSTX_RESERVED_AXIS_TYPES_.indexOf(t) === -1) continue;
    if (String(data[r][riC] || '').trim() !== ownerId) continue;
    if (ownerType && rtC !== -1 && String(data[r][rtC] || '').trim() !== ownerType) continue;
    var k = String(data[r][wC] || '').trim() + '||' + String(data[r][sC] || '').trim();
    out[k] = (out[k] || 0) + Math.round(parseFloat(data[r][qC]) || 0);
  }
  return out;
}

/**
 * APPLY. One (availableDelta, reservedDelta) pair, one snapshot update, one movement row, journalled.
 *
 * Both deltas are applied TOGETHER on one row. Writing them as two separate facts is precisely what would let
 * a reserve deduct availability while failing to raise reserved — the state in which the units are held by
 * nobody and allocatable by everybody.
 *
 * Invariants: neither bucket may go negative. There is deliberately NO `available - reserved >= 0` check here,
 * because that is the FACTORY invariant; for overseas the two buckets are independent stores and their sum is
 * the pool, not their difference.
 */
function ovsApplyDeltaTx_(p) {
  var snapSheet = p.snapSheet, movSheet = p.movSheet;
  var warehouseId = String(p.warehouseId || '').trim();
  var sku = String(p.sku || '').trim();
  var availDelta = (p.availableDelta === undefined || p.availableDelta === null || p.availableDelta === '')
    ? 0 : Math.round(Number(p.availableDelta));
  var resDelta = (p.reservedDelta === undefined || p.reservedDelta === null || p.reservedDelta === '')
    ? 0 : Math.round(Number(p.reservedDelta));
  var journal = p.journal || [];
  var now = p.now;
  if (!warehouseId || !sku) throw new Error('ovsApplyDeltaTx_: warehouseId + sku required');
  if (!isFinite(availDelta) || !isFinite(resDelta)) throw new Error('ovsApplyDeltaTx_: deltas must be finite');
  if (OVSTX_TX_WRITABLE_TYPES_.indexOf(String(p.movementType || '').trim()) === -1) {
    throw new Error('ovsApplyDeltaTx_: unknown movement_type "' + p.movementType + '" (closed vocabulary)');
  }

  var data = snapSheet.getDataRange().getValues();
  var C = ovsStockColsTx_(data[0]);
  if (C.wh === -1 || C.sku === -1 || C.avail === -1 || C.res === -1) {
    throw new Error('ovsApplyDeltaTx_: overseas_inventory_snapshot missing required columns');
  }

  var targetRow = -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][C.wh] || '').trim() === warehouseId && String(data[r][C.sku] || '').trim() === sku) {
      targetRow = r + 1; break;
    }
  }
  // A reservation against a pool with NO snapshot row is refused rather than creating one. An overseas row is
  // created by Import, which is the only thing that knows the site_sku and the source identity; minting one
  // here would invent a stock record as a side effect of reserving against it.
  if (targetRow === -1) throw new Error('ovsApplyDeltaTx_: no overseas_inventory_snapshot row for ' + warehouseId + ' / ' + sku);

  var beforeAvailable = Math.round(parseFloat(data[targetRow - 1][C.avail]) || 0);
  var beforeReserved = Math.round(parseFloat(data[targetRow - 1][C.res]) || 0);
  var physical = C.phys === -1 ? '' : data[targetRow - 1][C.phys];
  var siteSku = C.siteSku === -1 ? '' : String(data[targetRow - 1][C.siteSku] || '').trim();
  var afterAvailable = beforeAvailable + availDelta;
  var afterReserved = beforeReserved + resDelta;
  if (afterAvailable < 0) {
    throw new Error('ovsApplyDeltaTx_: resulting wh_available_stock would be negative (' + beforeAvailable + ' + ' + availDelta + ')');
  }
  if (afterReserved < 0) {
    throw new Error('ovsApplyDeltaTx_: resulting wh_reserved_stock would be negative (' + beforeReserved + ' + ' + resDelta + ')');
  }

  // Each cell is written ONLY when it actually changes, so a zero delta neither dirties a cell nor adds a
  // journal entry nor makes a replay look like a write.
  if (availDelta !== 0) {
    snapSheet.getRange(targetRow, C.avail + 1).setValue(afterAvailable);
    journal.push({ kind: 'cell', sheet: snapSheet, row: targetRow, col: C.avail, prev: beforeAvailable });
  }
  if (resDelta !== 0) {
    snapSheet.getRange(targetRow, C.res + 1).setValue(afterReserved);
    journal.push({ kind: 'cell', sheet: snapSheet, row: targetRow, col: C.res, prev: beforeReserved });
  }
  if (C.lastMov !== -1) {
    journal.push({ kind: 'cell', sheet: snapSheet, row: targetRow, col: C.lastMov, prev: data[targetRow - 1][C.lastMov] });
    snapSheet.getRange(targetRow, C.lastMov + 1).setValue(now);
  }
  if (C.updatedAt !== -1) {
    journal.push({ kind: 'cell', sheet: snapSheet, row: targetRow, col: C.updatedAt, prev: data[targetRow - 1][C.updatedAt] });
    snapSheet.getRange(targetRow, C.updatedAt + 1).setValue(now);
  }
  SpreadsheetApp.flush();

  // The movement row. `wh_quantity` is the movement's PRIMARY quantity and each caller states which delta that
  // is, because for a reservation BOTH buckets move and guessing produces a ledger that reads 0 for every
  // owner — which would silently break acquire idempotency, the dispatch release and any reconciliation at
  // once. 21_ learned this the same way; here it is a required parameter rather than an inference.
  var movementId = 'OVMV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
  var movHeaders = movSheet.getDataRange().getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var mvCol = function (n) { return movHeaders.indexOf(n); };
  var mvQty = mvCol('wh_quantity'); if (mvQty === -1) mvQty = mvCol('quantity');
  var mvQtyB = mvCol('wh_quantity_before'); if (mvQtyB === -1) mvQtyB = mvCol('quantity_before');
  var mvQtyA = mvCol('wh_quantity_after'); if (mvQtyA === -1) mvQtyA = mvCol('quantity_after');
  var movRow = new Array(movHeaders.length).fill('');
  var setMv = function (name, val) { var i = mvCol(name); if (i !== -1) movRow[i] = val; };
  setMv('movement_id', movementId);
  setMv('movement_date', p.movementDate || now);
  setMv('warehouse_id', warehouseId);
  setMv('sku', sku);
  setMv('site_sku', siteSku);
  setMv('movement_type', p.movementType);
  setMv('movement_scope', p.movementScope);
  setMv('from_stock_type', p.fromStockType === undefined ? '' : p.fromStockType);
  setMv('to_stock_type', p.toStockType === undefined ? '' : p.toStockType);
  if (mvQty !== -1) movRow[mvQty] = Math.round(Number(p.primaryQty));
  if (mvQtyB !== -1) movRow[mvQtyB] = (p.primaryAxis === 'available') ? beforeAvailable : beforeReserved;
  if (mvQtyA !== -1) movRow[mvQtyA] = (p.primaryAxis === 'available') ? afterAvailable : afterReserved;
  setMv('wh_before_available_stock', beforeAvailable);
  setMv('wh_after_available_stock', afterAvailable);
  setMv('wh_before_reserved_stock', beforeReserved);
  setMv('wh_after_reserved_stock', afterReserved);
  setMv('wh_before_physical_stock', physical);     // carried unchanged — physical has no Phase-1 lifecycle
  setMv('wh_after_physical_stock', physical);
  setMv('reference_type', p.referenceType || '');
  setMv('reference_id', p.referenceId || '');
  setMv('source_module', OVSTX_SOURCE_MODULE_);
  setMv('created_by', p.createdBy || 'operation-system');
  setMv('created_at', now);
  setMv('note', p.note || '');
  movSheet.appendRow(movRow);
  journal.push({ kind: 'row', sheet: movSheet, row: movSheet.getLastRow() });
  SpreadsheetApp.flush();

  return { movementId: movementId, row: targetRow,
    beforeAvailable: beforeAvailable, afterAvailable: afterAvailable,
    beforeReserved: beforeReserved, afterReserved: afterReserved };
}

/**
 * ACQUIRE — §2.  available -= qty, reserved += qty, in ONE row.
 *
 * Idempotent through the ledger, exactly as 21_ is: an owner already holding >= qty applies NOTHING, and a
 * partially-applied prior attempt tops up the shortfall rather than reserving twice.
 */
function ovsAcquireReservationTx_(p) {
  var qty = Math.round(Number(p.qty));
  if (!isFinite(qty) || qty <= 0) throw new Error('ovsAcquireReservationTx_: qty must be a positive integer');
  var ownerType = String(p.ownerType || OVSTX_RESERVATION_OWNER_TYPE_).trim();
  var ownerId = String(p.ownerId || '').trim();
  if (!ownerId) throw new Error('ovsAcquireReservationTx_: ownerId required (a reservation with no owner has no lineage)');
  var key = String(p.warehouseId || '').trim() + '||' + String(p.sku || '').trim();
  var held = (ovsOwnerReservedTx_(p.movSheet, ownerType, ownerId)[key] || 0);
  if (held >= qty) return { applied: false, reason: 'ALREADY_RESERVED', reserved: 0, alreadyHeld: held, movementId: '' };
  var need = qty - held;
  var res = ovsApplyDeltaTx_({
    snapSheet: p.snapSheet, movSheet: p.movSheet, warehouseId: p.warehouseId, sku: p.sku,
    availableDelta: -need, reservedDelta: need,
    movementType: OVSTX_MOV_RESERVE_ACQUIRE_, movementScope: 'reserved_stock',
    fromStockType: 'available', toStockType: 'reserved',
    primaryQty: need, primaryAxis: 'reserved',
    referenceType: ownerType, referenceId: ownerId,
    journal: p.journal, now: p.now, movementDate: p.movementDate, createdBy: p.createdBy,
    note: p.note || ('Overseas stock reserved for ' + ownerType + ' ' + ownerId)
  });
  return { applied: true, reason: 'RESERVED', reserved: need, alreadyHeld: held, movementId: res.movementId,
    beforeAvailable: res.beforeAvailable, afterAvailable: res.afterAvailable,
    beforeReserved: res.beforeReserved, afterReserved: res.afterReserved };
}

/**
 * RELEASE — §3.  reserved -= qty, available += qty.
 *
 * Gives back at most what THIS owner holds, so it can never release another owner's reservation and can never
 * drive a bucket negative. Holding nothing is a no-op rather than an error, which is what makes cancellation
 * and a replayed release safe.
 */
function ovsReleaseReservationTx_(p) {
  var ownerType = String(p.ownerType || OVSTX_RESERVATION_OWNER_TYPE_).trim();
  var ownerId = String(p.ownerId || '').trim();
  if (!ownerId) throw new Error('ovsReleaseReservationTx_: ownerId required');
  var key = String(p.warehouseId || '').trim() + '||' + String(p.sku || '').trim();
  var held = (ovsOwnerReservedTx_(p.movSheet, ownerType, ownerId)[key] || 0);
  if (held <= 0) return { applied: false, reason: 'NO_RESERVATION', released: 0, alreadyHeld: 0, movementId: '' };
  var want = (p.qty === undefined || p.qty === null || p.qty === '') ? held : Math.round(Number(p.qty));
  if (!isFinite(want) || want <= 0) return { applied: false, reason: 'NOTHING_TO_RELEASE', released: 0, alreadyHeld: held, movementId: '' };
  var give = Math.min(want, held);
  var res = ovsApplyDeltaTx_({
    snapSheet: p.snapSheet, movSheet: p.movSheet, warehouseId: p.warehouseId, sku: p.sku,
    availableDelta: give, reservedDelta: -give,
    movementType: OVSTX_MOV_RESERVE_RELEASE_, movementScope: 'reserved_stock',
    fromStockType: 'reserved', toStockType: 'available',
    primaryQty: -give, primaryAxis: 'reserved',
    referenceType: ownerType, referenceId: ownerId,
    journal: p.journal, now: p.now, movementDate: p.movementDate, createdBy: p.createdBy,
    note: p.note || ('Overseas stock reservation released for ' + ownerType + ' ' + ownerId +
      (p.releaseReason ? (' | reason=' + p.releaseReason) : ''))
  });
  return { applied: true, reason: 'RELEASED', released: give, alreadyHeld: held, movementId: res.movementId,
    beforeAvailable: res.beforeAvailable, afterAvailable: res.afterAvailable,
    beforeReserved: res.beforeReserved, afterReserved: res.afterReserved };
}

/**
 * CONSUME — §4.  reserved -= qty.  AVAILABLE IS NOT TOUCHED.
 *
 * This is the line §4 exists to protect. The units left `available` when the reservation was acquired; taking
 * them out again at dispatch would turn 70/30 into 40/0 and destroy thirty units that were never shipped. The
 * release of the hold rides this row's own reserved before/after pair — no separate reservation_release row is
 * written, which is the same asymmetry 22_ already relies on for factory and the same double count it avoids.
 */
function ovsConsumeReservationTx_(p) {
  var ownerType = String(p.ownerType || OVSTX_RESERVATION_OWNER_TYPE_).trim();
  var ownerId = String(p.ownerId || '').trim();
  if (!ownerId) throw new Error('ovsConsumeReservationTx_: ownerId required');
  var key = String(p.warehouseId || '').trim() + '||' + String(p.sku || '').trim();
  var held = (ovsOwnerReservedTx_(p.movSheet, ownerType, ownerId)[key] || 0);
  if (held <= 0) return { applied: false, reason: 'NO_RESERVATION', consumed: 0, alreadyHeld: 0, movementId: '' };
  var want = (p.qty === undefined || p.qty === null || p.qty === '') ? held : Math.round(Number(p.qty));
  if (!isFinite(want) || want <= 0) return { applied: false, reason: 'NOTHING_TO_CONSUME', consumed: 0, alreadyHeld: held, movementId: '' };
  var take = Math.min(want, held);
  var res = ovsApplyDeltaTx_({
    snapSheet: p.snapSheet, movSheet: p.movSheet, warehouseId: p.warehouseId, sku: p.sku,
    availableDelta: 0, reservedDelta: -take,          // available: NOT touched. §4.
    movementType: OVSTX_MOV_SHIPMENT_OUT_, movementScope: 'reserved_stock',
    fromStockType: 'reserved', toStockType: 'none',
    primaryQty: -take, primaryAxis: 'reserved',
    referenceType: ownerType, referenceId: ownerId,
    journal: p.journal, now: p.now, movementDate: p.movementDate, createdBy: p.createdBy,
    note: p.note || ('Overseas stock dispatched for ' + ownerType + ' ' + ownerId)
  });
  return { applied: true, reason: 'CONSUMED', consumed: take, alreadyHeld: held, movementId: res.movementId,
    beforeAvailable: res.beforeAvailable, afterAvailable: res.afterAvailable,
    beforeReserved: res.beforeReserved, afterReserved: res.afterReserved };
}

/**
 * THE SOURCE DOMAIN OF A WAREHOUSE — §11 / §12.
 *
 * Returns 'FACTORY' or 'OVERSEAS'. This is the ONLY thing that routes a shipment's sufficiency check and its
 * reservation between the two lifecycles; the two storage owners and the two arithmetics stay entirely
 * separate and are merely composed above by the caller.
 *
 * `is_factory_warehouse` is the canonical flag and `warehouse_type` is the fallback, which is the same
 * precedence overseasImportWarehouseIssue_ already applies. An unknown warehouse answers FACTORY so that
 * nothing about existing behaviour changes for a row this function cannot classify.
 */
function ovsWarehouseSourceDomain_(whRecord) {
  if (!whRecord) return 'FACTORY';
  if (whRecord.isFactory === true) return 'FACTORY';
  if (String(whRecord.type == null ? '' : whRecord.type).trim().toUpperCase() === 'FACTORY') return 'FACTORY';
  return 'OVERSEAS';
}

/** Read one warehouses row into the shape ovsWarehouseSourceDomain_ expects. Read-only. */
function ovsReadWarehouseRecord_(ss, warehouseId) {
  var whSheet = ss.getSheetByName('warehouses');
  if (!whSheet) return null;
  var data = whSheet.getDataRange().getValues();
  var H = (data[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
  var idC = H.indexOf('warehouse_id');
  if (idC === -1) return null;
  var facC = H.indexOf('is_factory_warehouse'), typeC = H.indexOf('warehouse_type');
  var actC = H.indexOf('is_active'), stC = H.indexOf('status');
  warehouseId = String(warehouseId == null ? '' : warehouseId).trim();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idC] || '').trim() !== warehouseId) continue;
    return {
      warehouseId: warehouseId,
      isFactory: facC === -1 ? false : overseasImportTruthy_(data[r][facC]),
      type: typeC === -1 ? '' : String(data[r][typeC] || '').trim(),
      isActive: actC !== -1 ? overseasImportTruthy_(data[r][actC])
        : (stC !== -1 ? String(data[r][stC] || '').trim().toLowerCase() === 'active' : true)
    };
  }
  return null;
}
// __OVS_LIFECYCLE_END__

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

