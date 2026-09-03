// ============================================================================================================
// TEMP_FC1AR1_RESERVATION_RECONCILIATION.gs — F1-7N-FC-1A-R1 §H
// ------------------------------------------------------------------------------------------------------------
// PASTE-RUN-COPY-REMOVE. Answers ONE question: does the stored `factory_stock.fac_reserved_stock` agree with
// what the movement ledger says it should be, per (warehouse_id, SKU)?
//
// IT CONTAINS NO ARITHMETIC OF ITS OWN. Every number comes from `factoryStockReconcileReservations_` in
// 21_factory_inventory_handlers.gs, which is the same pure function the FC-1A-R1 test suite executes. That is
// deliberate: a diagnostic with its OWN copy of the reconciliation rule is a second opinion, and when the two
// disagree nobody can tell which one is wrong. This file only reads rows, calls the canonical function, and
// bounds the output.
//
// THE ONE SUBTLETY IT GETS RIGHT, because getting it wrong reports a mismatch on every healthy shipment:
// a dispatch releases its own reservation by carrying a reserved before/after pair on its OWN `shipment_out`
// row — it does NOT write a separate `reservation_release`. So shipment_out is REPORTED
// (consumed_by_shipment_out) and never subtracted. Subtracting it as well would double-count every dispatched
// reservation.
//
// STRICTLY READ-ONLY, and structurally so: every sheet goes through readOnlyR1_(), which hands back plain
// arrays and retains no Sheet handle the calling code can write through. There is no setValue, appendRow,
// deleteRow, setValues, insertSheet, clearContent, getScriptLock, PropertiesService, UrlFetchApp, MailApp or
// DriveApp anywhere in this file.
//
// IT NEVER AUTO-REPAIRS. A mismatch is printed as FACTORY_RESERVATION_LEDGER_MISMATCH with the stored value,
// the derived value and the difference. A reserved balance that disagrees with its own ledger is a fact
// somebody has to look at, and rounding it into agreement destroys the only evidence of how it happened.
//
//   DB_WRITES=0 · REPAIRS=0 · RESERVATIONS_MODIFIED=0 · MOVEMENTS_WRITTEN=0
// ============================================================================================================

var FC1AR1_MAX_ROWS_ = 40;      // per list; a longer list is capped WITH its true total, never silently

function TEMP_FC1AR1_RESERVATION_RECONCILIATION() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = {
    report: 'FC-1A-R1_RESERVATION_RECONCILIATION',
    spreadsheet_id: ss.getId(),
    generated_at: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    db_writes: 0, repairs: 0, reservations_modified: 0
  };

  // The canonical function must be present. If 21_ was not synced, say so rather than computing a private
  // answer that could disagree with the one the system actually uses.
  if (typeof factoryStockReconcileReservations_ !== 'function') {
    out.error = 'RECONCILIATION_OWNER_NOT_DEPLOYED';
    out.detail = 'factoryStockReconcileReservations_ is absent, so 21_factory_inventory_handlers.gs is older ' +
      'than F1-7N-FC-1A-R1. Copy it and re-run. Nothing was computed and nothing was written.';
    Logger.log(JSON.stringify(out));
    return out;
  }

  var stock = readOnlyR1_(ss, 'factory_stock');
  var mov = readOnlyR1_(ss, 'factory_stock_movements');
  if (!stock) { out.error = 'FACTORY_STOCK_ABSENT'; Logger.log(JSON.stringify(out)); return out; }

  var stockRows = stock.objects();
  var movRows = mov ? mov.objects() : [];
  out.input = { factory_stock_rows: stockRows.length, movement_rows: movRows.length };

  var rec = factoryStockReconcileReservations_(stockRows, movRows);

  out.verdict = rec.code;                       // RECONCILED | FACTORY_RESERVATION_LEDGER_MISMATCH
  out.keys_examined = rec.keys_examined;
  out.note = rec.note;

  // Portfolio totals: the three numbers an operator actually reads first.
  var totCur = 0, totStored = 0, totDerived = 0, totConsumed = 0, unknownRows = 0;
  rec.rows.forEach(function (r) {
    totCur += r.current; totStored += r.stored_reserved; totDerived += r.derived_reserved;
    totConsumed += r.consumed_by_shipment_out; unknownRows += r.unknown_type_rows;
  });
  out.totals = {
    current: totCur, stored_reserved: totStored, derived_reserved: totDerived,
    available_by_stored: totCur - totStored, available_by_derived: totCur - totDerived,
    reserved_consumed_by_dispatch: totConsumed,
    rows_with_unknown_movement_type: unknownRows
  };

  // Only the keys that carry a reservation or a disagreement are listed. A warehouse/SKU at zero reserved and
  // zero ledger is the overwhelming majority of rows and says nothing, so printing it is exactly the verbosity
  // that truncated the A3 census.
  var interesting = rec.rows.filter(function (r) {
    return r.stored_reserved !== 0 || r.derived_reserved !== 0 || r.difference !== 0 ||
      r.consumed_by_shipment_out !== 0 || r.unknown_type_rows !== 0;
  }).map(function (r) {
    return [r.warehouse_id, r.sku, 'cur=' + r.current, 'stored=' + r.stored_reserved,
      'derived=' + r.derived_reserved, 'diff=' + r.difference, 'avail=' + r.derived_available,
      'dispatched=' + r.consumed_by_shipment_out].join('|');
  });
  out.reservation_keys = fc1ar1Cap_(interesting);

  // The mismatches, with their outstanding owners, because "which shipment is holding this" is the next
  // question every single time.
  out.mismatches = fc1ar1Cap_(rec.mismatches.map(function (r) {
    var owners = [];
    for (var o in r.outstanding_by_owner) {
      if (Object.prototype.hasOwnProperty.call(r.outstanding_by_owner, o)) {
        owners.push(o + '=' + r.outstanding_by_owner[o]);
      }
    }
    return [r.warehouse_id, r.sku, 'stored=' + r.stored_reserved, 'derived=' + r.derived_reserved,
      'diff=' + r.difference, 'has_stock_row=' + r.has_stock_row, 'owners=[' + owners.sort().join(',') + ']'].join('|');
  }));

  // Outstanding holds by owner, across every key. This is the list that tells an operator which Shipment
  // Drafts are holding units right now, and therefore which ones cancelling would free.
  var byOwner = {};
  rec.rows.forEach(function (r) {
    for (var o in r.outstanding_by_owner) {
      if (Object.prototype.hasOwnProperty.call(r.outstanding_by_owner, o)) {
        byOwner[o] = (byOwner[o] || 0) + r.outstanding_by_owner[o];
      }
    }
  });
  var ownerList = [];
  for (var k in byOwner) { if (Object.prototype.hasOwnProperty.call(byOwner, k) && byOwner[k] !== 0) ownerList.push(k + '=' + byOwner[k]); }
  out.outstanding_by_owner = fc1ar1Cap_(ownerList.sort());

  // Owners that hold units while their shipment is CANCELLED or DISPATCHED. Both are the specific corruption
  // R1 exists to prevent, so they are surfaced by name rather than left inside the mismatch list.
  out.holders_in_terminal_state = fc1ar1Cap_(fc1ar1TerminalHolders_(ss, byOwner));

  Logger.log(JSON.stringify(out));
  return out;
}

// ---- read-only facade ---------------------------------------------------------------------------------------
// `objects()` returns plain row objects. Nothing here closes over a writable Sheet, which is what makes the
// zero-write claim checkable rather than merely stated.
function readOnlyR1_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return null;
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  return {
    name: name,
    count: function () { return Math.max(0, values.length - 1); },
    objects: function () {
      return values.slice(1).map(function (row) {
        var o = {};
        for (var i = 0; i < headers.length; i++) if (headers[i]) o[headers[i]] = row[i];
        return o;
      });
    }
  };
}

function fc1ar1Str_(v) { return String(v == null ? '' : v).trim(); }
// Bounded list: capped, and the TOTAL is always exact. A truncated list that hid its own length would be the
// same failure as the truncated log this whole family of diagnostics exists to avoid.
function fc1ar1Cap_(arr) {
  var a = arr || [];
  return a.length > FC1AR1_MAX_ROWS_
    ? { total: a.length, shown: FC1AR1_MAX_ROWS_, rows: a.slice(0, FC1AR1_MAX_ROWS_), truncated: true }
    : { total: a.length, shown: a.length, rows: a, truncated: false };
}

// An owner holding a non-zero reservation whose shipment is cancelled or already dispatched. Either is a
// stranded hold: cancelled means the release did not happen, dispatched means the release was applied to a
// different key or not at all.
function fc1ar1TerminalHolders_(ss, byOwner) {
  var ship = readOnlyR1_(ss, 'shipments');
  if (!ship) return [];
  var statusById = {};
  ship.objects().forEach(function (r) {
    var id = fc1ar1Str_(r.shipment_id);
    if (id) statusById[id] = fc1ar1Str_(r.status).toLowerCase();
  });
  var terminal = { cancelled: 1, shipped: 1, in_transit: 1, arrived: 1, received: 1, closed: 1, completed: 1, delivered: 1 };
  var out = [];
  for (var owner in byOwner) {
    if (!Object.prototype.hasOwnProperty.call(byOwner, owner)) continue;
    if (byOwner[owner] <= 0) continue;
    var id = owner.indexOf(':') === -1 ? owner : owner.substring(owner.indexOf(':') + 1);
    var st = statusById[id];
    if (st && terminal[st]) out.push(id + '(' + st + ')=' + byOwner[owner]);
  }
  return out.sort();
}

// ---- OPTIONAL detail, ONE explicit key at a time ------------------------------------------------------------
// The bounded report above is the default precisely so this file can never be the reason an answer is
// truncated. When one warehouse/SKU genuinely needs inspecting, ask for that ONE key. Still read-only.
function TEMP_FC1AR1_DETAIL_ONE_KEY(warehouseId, sku) {
  warehouseId = fc1ar1Str_(warehouseId); sku = fc1ar1Str_(sku);
  if (!warehouseId || !sku) { Logger.log(JSON.stringify({ error: 'warehouse_id and sku required' })); return null; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mov = readOnlyR1_(ss, 'factory_stock_movements');
  var rows = [];
  if (mov) {
    mov.objects().forEach(function (m) {
      if (fc1ar1Str_(m.warehouse_id) !== warehouseId || fc1ar1Str_(m.sku) !== sku) return;
      rows.push([fc1ar1Str_(m.movement_date), fc1ar1Str_(m.movement_type),
        'qty=' + fc1ar1Str_(m.qty),
        'cur=' + fc1ar1Str_(m.before_current_stock) + '>' + fc1ar1Str_(m.after_current_stock),
        'res=' + fc1ar1Str_(m.before_reserved_stock) + '>' + fc1ar1Str_(m.after_reserved_stock),
        'owner=' + fc1ar1Str_(m.related_entity_type) + ':' + fc1ar1Str_(m.related_entity_id)].join('|'));
    });
  }
  var o = { report: 'FC-1A-R1_DETAIL_ONE_KEY', warehouse_id: warehouseId, sku: sku,
    movements: fc1ar1Cap_(rows), db_writes: 0 };
  Logger.log(JSON.stringify(o));
  return o;
}
