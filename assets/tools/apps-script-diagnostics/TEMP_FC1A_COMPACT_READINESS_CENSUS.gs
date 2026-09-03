// ============================================================================================================
// TEMP_FC1A_COMPACT_READINESS_CENSUS.gs — F1-7N-FC-1A §I
// ------------------------------------------------------------------------------------------------------------
// PASTE-RUN-COPY-REMOVE. One entry point. STRICTLY READ-ONLY, and bounded so the answer survives the log.
//
// WHY THIS EXISTS AS A REPLACEMENT RATHER THAN AN EDIT. The A3 census printed a full carrier eligibility trace
// before it printed the eligible id list, and the Apps Script execution log truncated the output BEFORE the
// list — so the one thing the round needed was the one thing that did not arrive. Verbosity is not a
// presentation problem here; it is what destroys the answer. This helper therefore prints ONE compact JSON
// object, with COUNTS and ID ARRAYS only. No row dumps, no per-carrier reasoning, no repeated headers.
//
// ZERO WRITES, AND THE CLAIM IS STRUCTURAL RATHER THAN A PROMISE. Every sheet is taken through readOnly_(),
// which returns an object exposing exactly two methods (headers/rows) and does NOT retain a mutable Sheet
// handle the calling code can reach. There is no setValue, appendRow, deleteRow, insertSheet, getScriptLock,
// PropertiesService, UrlFetchApp, MailApp or DriveApp anywhere in this file, and a test in the FC-1A suite
// fails if any of those names appears in its CODE (with its printed strings stripped, so prose that merely
// names a verb cannot mask a real call).
//
// IT DOES NOT CLASSIFY OR REPAIR PRODUCTION ROWS. It reports what is there. Every verdict word it prints is a
// description of the rows, never an instruction that something be changed, and nothing here decides that a row
// is wrong — a quantity that does not reconcile is reported as unreconciled, never rounded into agreement.
//
//   DB_WRITES=0 · STOCK_MOVEMENTS_WRITTEN=0 · REPAIRS=0 · MASTER_DATA_CHANGES=0 · RESERVATIONS_MODIFIED=0
// ============================================================================================================

var FC1A_MAX_IDS_ = 60;          // per list; a longer list is truncated WITH its true total, never silently
var FC1A_ACQUIRE_ = 'reservation_acquire';
var FC1A_RELEASE_ = 'reservation_release';

function TEMP_FC1A_COMPACT_READINESS_CENSUS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = {
    report: 'FC-1A_COMPACT_READINESS_CENSUS',
    spreadsheet_id: ss.getId(),
    generated_at: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    db_writes: 0, repairs: 0, reservations_modified: 0
  };

  out.schema = fc1aSchema_(ss);
  out.allocation_drafts = fc1aDraftCensus_(ss);
  out.approved_plans_without_shipment = fc1aApprovedWithoutShipment_(ss);
  out.reservations = fc1aReservationCensus_(ss);
  out.stock_totals = fc1aStockTotals_(ss);
  out.anomalies = fc1aAnomalies_(ss, out.reservations);

  Logger.log(JSON.stringify(out));
  return out;
}

// ---- read-only sheet facade --------------------------------------------------------------------------------
// The returned object carries NO Sheet reference the caller can write through: `values` is a plain array and
// the two accessors close over it. This is why the zero-write claim is checkable rather than merely stated.
function readOnly_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return null;
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  var lower = headers.map(function (h) { return h.toLowerCase(); });
  return {
    name: name,
    headers: function () { return headers.slice(); },
    count: function () { return Math.max(0, values.length - 1); },
    col: function (n) {
      var i = headers.indexOf(n);
      return i !== -1 ? i : lower.indexOf(String(n).toLowerCase());
    },
    rows: function () { return values.slice(1); }
  };
}

function fc1aStr_(v) { return String(v == null ? '' : v).trim(); }
function fc1aNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
// Bounded id list: the array is capped, the TOTAL is always exact. A truncated list that hid its own length
// would be the same failure as a truncated log.
function fc1aIds_(arr) {
  var a = arr || [];
  return a.length > FC1A_MAX_IDS_
    ? { total: a.length, shown: FC1A_MAX_IDS_, ids: a.slice(0, FC1A_MAX_IDS_), truncated: true }
    : { total: a.length, shown: a.length, ids: a, truncated: false };
}

// ---- 1) schema / header counts ------------------------------------------------------------------------------
function fc1aSchema_(ss) {
  var want = ['factory_stock', 'factory_stock_movements', 'shipping_allocation_drafts',
    'shipping_allocation_draft_lines', 'shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines',
    'purchase_order_lines'];
  var o = {};
  for (var i = 0; i < want.length; i++) {
    var sh = readOnly_(ss, want[i]);
    o[want[i]] = sh ? { headers: sh.headers().length, rows: sh.count() } : { headers: 0, rows: 0, absent: true };
  }
  // The two columns the whole reservation model rests on. Their ABSENCE is the single most consequential
  // schema fact this census can report, so it is reported as its own flag rather than left to be inferred.
  var fs = readOnly_(ss, 'factory_stock');
  o.reservation_columns_present = !!(fs && fs.col('fac_reserved_stock') !== -1 || (fs && fs.col('reserved_stock') !== -1));
  var mv = readOnly_(ss, 'factory_stock_movements');
  o.movement_reserved_snapshot_columns_present = !!(mv && mv.col('before_reserved_stock') !== -1 && mv.col('after_reserved_stock') !== -1);
  return o;
}

// ---- 2) active allocation draft census ----------------------------------------------------------------------
// Header-level only, and deliberately NOT classified by K2/K4 equality: a draft is complete when its own
// required fields are present, incomplete when they are not, orphaned when no line references it, and
// cancelled when it says so. Cancelled rows are historical evidence and are counted, never touched.
function fc1aDraftCensus_(ss) {
  var h = readOnly_(ss, 'shipping_allocation_drafts');
  var l = readOnly_(ss, 'shipping_allocation_draft_lines');
  if (!h) return { absent: true };
  var cId = h.col('allocation_draft_id'), cStatus = h.col('status'), cSku = h.col('sku');
  var cMethod = h.col('shipping_method'), cSrc = h.col('source_warehouse_id'), cDest = h.col('destination_warehouse_id');
  var lineRefs = {};
  if (l) {
    var lRef = l.col('allocation_draft_id');
    if (lRef !== -1) l.rows().forEach(function (r) { var k = fc1aStr_(r[lRef]); if (k) lineRefs[k] = (lineRefs[k] || 0) + 1; });
  }
  var complete = [], incomplete = [], orphan = [], cancelled = [];
  h.rows().forEach(function (r) {
    var id = cId === -1 ? '' : fc1aStr_(r[cId]);
    if (!id) return;
    var st = cStatus === -1 ? '' : fc1aStr_(r[cStatus]).toLowerCase();
    if (st === 'cancelled') { cancelled.push(id); return; }
    if (!lineRefs[id]) { orphan.push(id); return; }
    var missing = [];
    if (cSku !== -1 && !fc1aStr_(r[cSku])) missing.push('sku');
    if (cMethod !== -1 && !fc1aStr_(r[cMethod])) missing.push('shipping_method');
    if (cSrc !== -1 && !fc1aStr_(r[cSrc])) missing.push('source_warehouse_id');
    if (cDest !== -1 && !fc1aStr_(r[cDest])) missing.push('destination_warehouse_id');
    if (missing.length) incomplete.push(id + ':' + missing.join('+'));
    else complete.push(id);
  });
  return {
    active_complete: fc1aIds_(complete),
    active_incomplete_with_missing_fields: fc1aIds_(incomplete),
    orphan_headers: fc1aIds_(orphan),
    cancelled_headers: fc1aIds_(cancelled)
  };
}

// ---- 3) approved plans with no shipment ---------------------------------------------------------------------
// THE FC-1A SUBJECT, counted directly. Each id here is a committed human approval whose Execution Commit did
// not happen. Before this round nothing in the frontend could recover one; the plan card's Retry Shipment
// Draft now can, and this list is how many are waiting.
function fc1aApprovedWithoutShipment_(ss) {
  var p = readOnly_(ss, 'shipping_plans');
  var sh = readOnly_(ss, 'shipments');
  if (!p) return { absent: true };
  var refs = {};
  if (sh) {
    ['shipping_plan_id', 'source_shipping_plan_id', 'plan_id'].forEach(function (n) {
      var c = sh.col(n);
      if (c === -1) return;
      sh.rows().forEach(function (r) { var k = fc1aStr_(r[c]); if (k) refs[k] = 1; });
    });
  }
  var cId = p.col('shipping_plan_id'), cStatus = p.col('status');
  var cXfer = p.col('transferred_shipment_id'), cComplete = p.col('completed_at');
  var pending = [], pendingCompleted = [];
  p.rows().forEach(function (r) {
    var id = cId === -1 ? '' : fc1aStr_(r[cId]);
    if (!id) return;
    if (cStatus === -1 || fc1aStr_(r[cStatus]).toLowerCase() !== 'approved') return;
    if (refs[id]) return;
    if (cXfer !== -1 && fc1aStr_(r[cXfer])) return;   // the plan itself records a shipment
    // A plan marked Done while its shipment is missing is the WORSE version of this state: it has left the
    // active view, so nobody is looking at it. Reported separately for that reason.
    if (cComplete !== -1 && fc1aStr_(r[cComplete])) pendingCompleted.push(id);
    else pending.push(id);
  });
  return {
    state: 'APPROVED_SHIPMENT_CREATION_PENDING',
    visible_on_plan_page: fc1aIds_(pending),
    already_marked_done_and_therefore_hidden: fc1aIds_(pendingCompleted)
  };
}

// ---- 4) reservations by warehouse / sku ----------------------------------------------------------------------
// Computed from the movement ledger, which is what makes it checkable against the balance column. Net held per
// owner is SUM(acquire) - SUM(release); an owner at zero is fully released and is NOT reported as a holder.
function fc1aReservationCensus_(ss) {
  var mv = readOnly_(ss, 'factory_stock_movements');
  if (!mv) return { absent: true };
  var cT = mv.col('movement_type'), cQ = mv.col('qty'), cW = mv.col('warehouse_id'), cS = mv.col('sku');
  var cRT = mv.col('related_entity_type'), cRI = mv.col('related_entity_id');
  if (cT === -1 || cQ === -1) return { unreadable: true };
  var byKey = {}, byOwner = {}, acquires = 0, releases = 0;
  mv.rows().forEach(function (r) {
    var t = fc1aStr_(r[cT]);
    if (t !== FC1A_ACQUIRE_ && t !== FC1A_RELEASE_) return;
    if (t === FC1A_ACQUIRE_) acquires++; else releases++;
    var key = fc1aStr_(r[cW]) + '||' + fc1aStr_(r[cS]);
    var owner = (cRT === -1 ? '' : fc1aStr_(r[cRT])) + ':' + (cRI === -1 ? '' : fc1aStr_(r[cRI]));
    var q = Math.round(fc1aNum_(r[cQ]));
    byKey[key] = (byKey[key] || 0) + q;
    byOwner[owner] = (byOwner[owner] || 0) + q;
  });
  var held = [];
  for (var k in byKey) { if (Object.prototype.hasOwnProperty.call(byKey, k) && byKey[k] !== 0) held.push(k + '=' + byKey[k]); }
  var owners = [];
  for (var o in byOwner) { if (Object.prototype.hasOwnProperty.call(byOwner, o) && byOwner[o] !== 0) owners.push(o + '=' + byOwner[o]); }
  return {
    acquire_rows: acquires, release_rows: releases,
    ledger_net_by_warehouse_sku: fc1aIds_(held.sort()),
    ledger_net_by_owner: fc1aIds_(owners.sort())
  };
}

// ---- 5) current / reserved / available totals -----------------------------------------------------------------
function fc1aStockTotals_(ss) {
  var fs = readOnly_(ss, 'factory_stock');
  if (!fs) return { absent: true };
  var cC = fs.col('fac_current_stock'); if (cC === -1) cC = fs.col('current_stock');
  var cR = fs.col('fac_reserved_stock'); if (cR === -1) cR = fs.col('reserved_stock');
  if (cC === -1 || cR === -1) return { unreadable: true };
  var cur = 0, res = 0, rowsWithReservation = 0, negativeAvailable = [];
  var cW = fs.col('warehouse_id'), cS = fs.col('sku');
  fs.rows().forEach(function (r) {
    var c = Math.round(fc1aNum_(r[cC])), v = Math.round(fc1aNum_(r[cR]));
    cur += c; res += v;
    if (v !== 0) rowsWithReservation++;
    // available < 0 is the invariant the shared transaction refuses to create. Any row here predates the
    // guard or was written outside it, which is exactly the kind of thing a census should surface, not fix.
    if (c - v < 0) negativeAvailable.push(fc1aStr_(r[cW]) + '||' + fc1aStr_(r[cS]) + '=' + (c - v));
  });
  return {
    current_total: cur, reserved_total: res, available_total: cur - res,
    rows_with_nonzero_reservation: rowsWithReservation,
    rows_with_negative_available: fc1aIds_(negativeAvailable)
  };
}

// ---- 6) duplicate / idempotency anomalies ---------------------------------------------------------------------
function fc1aAnomalies_(ss, reservations) {
  var out = {};

  // (a) two shipments for one shipping plan — the condition the one-shipment-per-plan idempotency exists to
  // prevent. Reported by plan id so each can be inspected individually.
  var sh = readOnly_(ss, 'shipments');
  if (sh) {
    var c = sh.col('shipping_plan_id');
    if (c !== -1) {
      var n = {};
      sh.rows().forEach(function (r) { var k = fc1aStr_(r[c]); if (k) n[k] = (n[k] || 0) + 1; });
      var dup = [];
      for (var k in n) { if (Object.prototype.hasOwnProperty.call(n, k) && n[k] > 1) dup.push(k + '=' + n[k]); }
      out.plans_with_more_than_one_shipment = fc1aIds_(dup.sort());
    }
  }

  // (b) duplicate movement ids — an append-only ledger with a repeated primary key cannot be reconciled at
  // all, so it is checked before anything is computed FROM the ledger.
  var mv = readOnly_(ss, 'factory_stock_movements');
  if (mv) {
    var ci = mv.col('factory_stock_movement_id');
    if (ci !== -1) {
      var seen = {}, dupIds = [];
      mv.rows().forEach(function (r) {
        var id = fc1aStr_(r[ci]);
        if (!id) return;
        if (seen[id]) dupIds.push(id); else seen[id] = 1;
      });
      out.duplicate_movement_ids = fc1aIds_(dupIds);
    }
    // (c) a movement whose after_reserved does not equal before_reserved + qty for a reservation row. This is
    // the ledger disagreeing with ITSELF, which no downstream reconciliation can recover from.
    var cT = mv.col('movement_type'), cQ = mv.col('qty');
    var cB = mv.col('before_reserved_stock'), cA = mv.col('after_reserved_stock'), cId = mv.col('factory_stock_movement_id');
    if (cT !== -1 && cQ !== -1 && cB !== -1 && cA !== -1) {
      var bad = [];
      mv.rows().forEach(function (r) {
        var t = fc1aStr_(r[cT]);
        if (t !== FC1A_ACQUIRE_ && t !== FC1A_RELEASE_) return;
        var b = Math.round(fc1aNum_(r[cB])), a = Math.round(fc1aNum_(r[cA])), q = Math.round(fc1aNum_(r[cQ]));
        if (a !== b + q) bad.push((cId === -1 ? '?' : fc1aStr_(r[cId])) + ':' + b + '+' + q + '!=' + a);
      });
      out.reservation_rows_whose_snapshot_disagrees = fc1aIds_(bad);
    }
  }

  // (d) THE RECONCILIATION THAT MATTERS: does the reserved BALANCE column agree with the reservation LEDGER?
  // Reported as a verdict word plus both numbers, and never rounded into agreement.
  var fs = readOnly_(ss, 'factory_stock');
  if (fs && reservations && !reservations.absent && !reservations.unreadable) {
    var cC2 = fs.col('fac_reserved_stock'); if (cC2 === -1) cC2 = fs.col('reserved_stock');
    var cW2 = fs.col('warehouse_id'), cS2 = fs.col('sku');
    var ledger = {};
    (reservations.ledger_net_by_warehouse_sku.ids || []).forEach(function (e) {
      var i = e.lastIndexOf('=');
      ledger[e.substring(0, i)] = Math.round(fc1aNum_(e.substring(i + 1)));
    });
    var disagree = [];
    if (cC2 !== -1 && cW2 !== -1 && cS2 !== -1) {
      fs.rows().forEach(function (r) {
        var key = fc1aStr_(r[cW2]) + '||' + fc1aStr_(r[cS2]);
        var bal = Math.round(fc1aNum_(r[cC2]));
        var led = ledger[key] || 0;
        if (bal !== led) disagree.push(key + ' balance=' + bal + ' ledger=' + led);
        delete ledger[key];
      });
      // A ledger entry with no factory_stock row at all: reserved units against stock that does not exist.
      for (var lk in ledger) {
        if (Object.prototype.hasOwnProperty.call(ledger, lk) && ledger[lk] !== 0) {
          disagree.push(lk + ' balance=NO_ROW ledger=' + ledger[lk]);
        }
      }
    }
    out.reserved_balance_vs_ledger = {
      verdict: disagree.length ? 'BALANCE_DISAGREES' : 'RECONCILED',
      disagreements: fc1aIds_(disagree.sort())
    };
  }

  // (e) a shipment that has DISPATCHED but still holds a reservation. Dispatch releases what it deducts, so a
  // holder in a shipped state means a release did not happen or was applied to a different key.
  if (sh && reservations && reservations.ledger_net_by_owner) {
    var cSt = sh.col('status'), cSi = sh.col('shipment_id');
    var shippedIds = {};
    if (cSt !== -1 && cSi !== -1) {
      sh.rows().forEach(function (r) {
        var st = fc1aStr_(r[cSt]).toLowerCase();
        if (st === 'shipped' || st === 'in_transit' || st === 'arrived' || st === 'received' || st === 'completed' || st === 'closed') {
          shippedIds[fc1aStr_(r[cSi])] = st;
        }
      });
    }
    var stuck = [];
    (reservations.ledger_net_by_owner.ids || []).forEach(function (e) {
      var i = e.lastIndexOf('=');
      var owner = e.substring(0, i), qty = Math.round(fc1aNum_(e.substring(i + 1)));
      var id = owner.indexOf(':') === -1 ? owner : owner.substring(owner.indexOf(':') + 1);
      if (qty > 0 && shippedIds[id]) stuck.push(id + '(' + shippedIds[id] + ')=' + qty);
    });
    out.dispatched_shipments_still_holding_reservation = fc1aIds_(stuck.sort());
  }

  return out;
}

// ---- OPTIONAL detail, ONE explicit id at a time ---------------------------------------------------------------
// The bounded main report is the default precisely so this file cannot be the reason an answer is truncated
// again. When one id genuinely needs inspecting, ask for that ONE id. Still strictly read-only.
function TEMP_FC1A_DETAIL_ONE_SHIPMENT(shipmentId) {
  shipmentId = fc1aStr_(shipmentId);
  if (!shipmentId) { Logger.log(JSON.stringify({ error: 'shipment_id required' })); return null; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mv = readOnly_(ss, 'factory_stock_movements');
  var rows = [];
  if (mv) {
    var cRI = mv.col('related_entity_id'), cT = mv.col('movement_type'), cQ = mv.col('qty');
    var cW = mv.col('warehouse_id'), cS = mv.col('sku'), cD = mv.col('movement_date');
    mv.rows().forEach(function (r) {
      if (cRI === -1 || fc1aStr_(r[cRI]) !== shipmentId) return;
      rows.push([fc1aStr_(r[cD]), fc1aStr_(r[cT]), fc1aStr_(r[cW]), fc1aStr_(r[cS]), Math.round(fc1aNum_(r[cQ]))].join('|'));
    });
  }
  var o = { report: 'FC-1A_DETAIL_ONE_SHIPMENT', shipment_id: shipmentId, movements: fc1aIds_(rows), db_writes: 0 };
  Logger.log(JSON.stringify(o));
  return o;
}

function TEMP_FC1A_DETAIL_ONE_PLAN(planId) {
  planId = fc1aStr_(planId);
  if (!planId) { Logger.log(JSON.stringify({ error: 'shipping_plan_id required' })); return null; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var p = readOnly_(ss, 'shipping_plans'), pl = readOnly_(ss, 'shipping_plan_lines'), sh = readOnly_(ss, 'shipments');
  var o = { report: 'FC-1A_DETAIL_ONE_PLAN', shipping_plan_id: planId, db_writes: 0 };
  if (p) {
    var cId = p.col('shipping_plan_id'), cSt = p.col('status'), cX = p.col('transferred_shipment_id'), cSrc = p.col('source_warehouse_id');
    p.rows().forEach(function (r) {
      if (cId === -1 || fc1aStr_(r[cId]) !== planId) return;
      o.status = cSt === -1 ? '' : fc1aStr_(r[cSt]);
      o.transferred_shipment_id = cX === -1 ? '' : fc1aStr_(r[cX]);
      o.source_warehouse_id = cSrc === -1 ? '' : fc1aStr_(r[cSrc]);
    });
  }
  if (pl) {
    var lP = pl.col('shipping_plan_id'), lS = pl.col('sku'), lA = pl.col('approved_qty');
    var lines = [];
    pl.rows().forEach(function (r) {
      if (lP === -1 || fc1aStr_(r[lP]) !== planId) return;
      lines.push(fc1aStr_(r[lS]) + '=' + Math.round(fc1aNum_(r[lA])));
    });
    o.lines = fc1aIds_(lines);
  }
  if (sh) {
    var sP = sh.col('shipping_plan_id'), sI = sh.col('shipment_id');
    var found = [];
    sh.rows().forEach(function (r) { if (sP !== -1 && fc1aStr_(r[sP]) === planId) found.push(fc1aStr_(r[sI])); });
    o.shipments = fc1aIds_(found);
  }
  Logger.log(JSON.stringify(o));
  return o;
}
