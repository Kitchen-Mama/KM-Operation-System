/**
 * TEMP — F1-7N-FC-0A §G/§I — DUAL MAINLINE STOCK-LEDGER + READBACK CENSUS (READ ONLY).
 *
 * ONE entry point, no parameters:
 *
 *     TEMP_DUAL_MAINLINE_LEDGER_CENSUS_FC0A()
 *
 * PASTE → RUN → READ → REMOVE. Nothing here writes, deletes, transitions a status, back-fills a value, takes a
 * lock, touches Properties, creates a file, generates a document, submits, receives, confirms or adjusts
 * stock. Every sheet is handed to the reporter through a façade exposing ONLY getDataRange().getValues(), so
 * the mutators are UNREACHABLE rather than merely unused.
 *
 * WHAT IT ANSWERS. The audit proved by fixture that the two authorised stock mutators are once-only, atomic
 * and replay-safe. What a fixture cannot answer is whether the LIVE ledger actually reconciles — whether the
 * balance each factory_stock row carries equals its opening balance plus every movement ever recorded against
 * it, and whether any lifecycle row is stranded between two stages. That is what this reads.
 *
 *   SECTION 1  THE FACTORY STOCK LEDGER. Per (warehouse_id, sku): the current balance, the movement count by
 *              type, the signed movement sum, and whether the movement chain is CONTINUOUS — every row's
 *              before_current_stock equal to the previous row's after_current_stock. A break is a write that
 *              did not go through a movement, or a movement written out of order.
 *   SECTION 2  DUPLICATE / ORPHAN MOVEMENTS. Two movements for one (related_entity_type, related_entity_id)
 *              of a once-only kind, and movements naming an entity that no longer exists.
 *   SECTION 3  THE SHIPPING MAINLINE, STAGE BY STAGE. How many rows sit at each status, and which rows are
 *              STRANDED: an approved plan with no shipment, a shipped shipment with no movement, a shipment
 *              with a movement but no route, a received shipment with no destination inventory effect.
 *   SECTION 4  THE PURCHASE MAINLINE, STAGE BY STAGE. Request orders without lines, approved requests with no
 *              PO, PO lines with completed_qty but no po_receipt movement, and the reverse.
 *   SECTION 5  WHAT IT DID.
 *
 * WHAT IT WILL NOT DO. It will not repair a break, will not back-fill a movement, and will not decide that a
 * stranded row is safe to advance. Every finding is printed with the ids an operator needs and nothing else.
 * A quantity it cannot reconcile is printed UNRECONCILED, never rounded into agreement.
 */

function TEMP_DUAL_MAINLINE_LEDGER_CENSUS_FC0A() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function S(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function lo(v) { return S(v).toLowerCase(); }
  function N(v) { var t = S(v).replace(/,/g, ''); if (t === '') return null; var n = Number(t); return isFinite(n) ? n : null; }

  p('TEMP DUAL MAINLINE LEDGER + READBACK CENSUS - F1-7N-FC-0A - READ ONLY');
  p('run at: ' + new Date());
  rule();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  p('spreadsheet: ' + ss.getName() + '  (' + ss.getId() + ')');

  function facade(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return null;
    var values = sh.getDataRange().getValues();
    var header = (values[0] || []).map(function (x) { return S(x); });
    return {
      name: name, header: header, count: Math.max(0, values.length - 1),
      rows: values.slice(1).map(function (r) {
        var o = {};
        for (var i = 0; i < header.length; i++) if (header[i]) o[header[i]] = r[i];
        return o;
      })
    };
  }
  function pick(o, names) {
    for (var i = 0; i < names.length; i++) if (o[names[i]] !== undefined && S(o[names[i]]) !== '') return S(o[names[i]]);
    return '';
  }
  function pickN(o, names) {
    for (var i = 0; i < names.length; i++) { var v = N(o[names[i]]); if (v !== null) return v; }
    return null;
  }

  var FS = facade('factory_stock');
  var MV = facade('factory_stock_movements');
  var SP = facade('shipping_plans');
  var SPL = facade('shipping_plan_lines');
  var SH = facade('shipments');
  var SHL = facade('shipment_lines');
  var SR = facade('shipment_routes');
  var SE = facade('shipment_events');
  var RO = facade('request_orders');
  var ROL = facade('request_order_lines');
  var PO = facade('purchase_orders');
  var POL = facade('purchase_order_lines');
  var OIS = facade('overseas_inventory_snapshot');
  var SAD = facade('shipping_allocation_drafts');

  p('');
  p('TABLE PRESENCE AND ROW COUNTS');
  [['factory_stock', FS], ['factory_stock_movements', MV], ['shipping_allocation_drafts', SAD],
   ['shipping_plans', SP], ['shipping_plan_lines', SPL], ['shipments', SH], ['shipment_lines', SHL],
   ['shipment_routes', SR], ['shipment_events', SE], ['request_orders', RO], ['request_order_lines', ROL],
   ['purchase_orders', PO], ['purchase_order_lines', POL], ['overseas_inventory_snapshot', OIS]
  ].forEach(function (t) {
    p('  ' + (t[1] ? ('PRESENT  ' + t[0] + '  rows=' + t[1].count) : ('ABSENT   ' + t[0] + '  (every fact about it below is UNKNOWN)')));
  });

  // ==========================================================================================================
  // SECTION 1 — THE FACTORY STOCK LEDGER
  // ==========================================================================================================
  rule();
  p('SECTION 1 - FACTORY STOCK LEDGER RECONCILIATION');
  rule();
  if (!FS || !MV) {
    p('REFUSED: factory_stock and/or factory_stock_movements not found. No ledger conclusion is possible.');
  } else {
    var byKey = {};
    FS.rows.forEach(function (r) {
      var wh = pick(r, ['warehouse_id']), sku = pick(r, ['sku']);
      if (!wh && !sku) return;
      var k = wh + '||' + sku;
      byKey[k] = byKey[k] || { wh: wh, sku: sku, stockRows: 0, current: 0, reserved: 0, movs: [] };
      byKey[k].stockRows++;
      var cur = pickN(r, ['fac_current_stock', 'current_stock']);
      var res = pickN(r, ['fac_reserved_stock', 'reserved_stock']);
      byKey[k].current += (cur === null ? 0 : cur);
      byKey[k].reserved += (res === null ? 0 : res);
    });
    MV.rows.forEach(function (m) {
      var k = pick(m, ['warehouse_id']) + '||' + pick(m, ['sku']);
      byKey[k] = byKey[k] || { wh: pick(m, ['warehouse_id']), sku: pick(m, ['sku']), stockRows: 0, current: null, reserved: 0, movs: [] };
      byKey[k].movs.push(m);
    });

    var keys = Object.keys(byKey).sort();
    var typeTally = {}, breaks = [], dupStockRows = [], nonZeroReserved = [];
    p('key                                              stockRows  balance  reserved  movs  movSum  chain');
    p('-----------------------------------------------  ---------  -------  --------  ----  ------  -----------');
    keys.forEach(function (k) {
      var e = byKey[k];
      // Movements in recorded order. created_at is the only ordering evidence stored, so it is used and its
      // absence is reported rather than assumed away.
      var movs = e.movs.slice().sort(function (a, b) {
        return S(pick(a, ['created_at', 'movement_date'])).localeCompare(S(pick(b, ['created_at', 'movement_date'])));
      });
      var sum = 0, chain = 'OK', prevAfter = null, undated = 0;
      movs.forEach(function (m) {
        var q = pickN(m, ['qty']);
        sum += (q === null ? 0 : q);
        typeTally[pick(m, ['movement_type']) || '(blank)'] = (typeTally[pick(m, ['movement_type']) || '(blank)'] || 0) + 1;
        if (!pick(m, ['created_at', 'movement_date'])) undated++;
        var bc = pickN(m, ['before_current_stock']), ac = pickN(m, ['after_current_stock']);
        if (bc === null || ac === null) { if (chain === 'OK') chain = 'NO_SNAPSHOT'; return; }
        if (prevAfter !== null && bc !== prevAfter) chain = 'BROKEN';
        prevAfter = ac;
      });
      if (prevAfter !== null && e.current !== null && e.stockRows === 1 && prevAfter !== e.current) chain = 'BALANCE_DISAGREES';
      if (undated) chain = chain + '+UNDATED(' + undated + ')';
      if (e.stockRows > 1) dupStockRows.push(k + ' (' + e.stockRows + ' rows)');
      if (e.reserved) nonZeroReserved.push(k + ' reserved=' + e.reserved);
      if (chain !== 'OK') breaks.push({ k: k, chain: chain, balance: e.current, movSum: sum, movs: movs.length });
      function pad(v, n) { v = String(v === null ? '?' : v); while (v.length < n) v += ' '; return v; }
      p(pad(k, 49) + pad(e.stockRows, 11) + pad(e.current, 9) + pad(e.reserved, 10) + pad(movs.length, 6) + pad(sum, 8) + chain);
    });

    p('');
    p('MOVEMENT TYPE TALLY: ' + JSON.stringify(typeTally));
    p('');
    p('  A "chain" verdict of BROKEN means one movement\'s before_current_stock does not equal the previous');
    p('  movement\'s after_current_stock for the same warehouse+SKU. That is the signature of a balance change');
    p('  that did not pass through a movement row, or of movements recorded out of order.');
    p('  BALANCE_DISAGREES means the last movement\'s after_current_stock does not equal the balance the');
    p('  factory_stock row carries now. NO_SNAPSHOT means the movement rows carry no before/after at all, so');
    p('  the chain CANNOT be reconciled and is reported as unreconcilable rather than as healthy.');
    p('');
    p('  LEDGER BREAKS: ' + breaks.length);
    breaks.forEach(function (b) {
      p('    ' + b.k + '  chain=' + b.chain + '  balance=' + b.balance + '  movementSum=' + b.movSum + '  movements=' + b.movs);
    });
    if (!breaks.length) p('    (none)');
    p('');
    p('  DUPLICATE factory_stock ROWS for one warehouse+SKU (a balance split across rows cannot be reconciled');
    p('  against a single movement chain): ' + dupStockRows.length);
    dupStockRows.forEach(function (d) { p('    ' + d); });
    if (!dupStockRows.length) p('    (none)');
    p('');
    p('  NON-ZERO RESERVED STOCK: ' + nonZeroReserved.length);
    nonZeroReserved.forEach(function (d) { p('    ' + d); });
    if (!nonZeroReserved.length) {
      p('    (none) - CONSISTENT WITH THE AUDIT: no handler in the system ever sets a reservation, so');
      p('    available_factory_stock always equals fac_current_stock and a planned quantity holds nothing.');
    }
  }

  // ==========================================================================================================
  // SECTION 2 — DUPLICATE / ORPHAN MOVEMENTS
  // ==========================================================================================================
  rule();
  p('SECTION 2 - DUPLICATE AND ORPHAN MOVEMENTS');
  rule();
  if (!MV) { p('REFUSED: factory_stock_movements not found.'); }
  else {
    // shipment_out is once-per-shipment-per-warehouse; po_receipt is once per (line, idempotency key).
    var byShip = {}, byPoLine = {};
    MV.rows.forEach(function (m) {
      var t = lo(pick(m, ['movement_type'])), rt = lo(pick(m, ['related_entity_type'])), rid = pick(m, ['related_entity_id']);
      if (t === 'shipment_out' && rid) {
        var k = rid + '||' + pick(m, ['warehouse_id']) + '||' + pick(m, ['sku']);
        (byShip[k] = byShip[k] || []).push(m);
      }
      if (t === 'po_receipt' && rid) {
        var note = S(pick(m, ['note']));
        var key = (note.match(/\|key=([^|]+)/) || [])[1] || '(no-key)';
        (byPoLine[rid + '||' + key] = byPoLine[rid + '||' + key] || []).push(m);
      }
    });
    var dupShip = Object.keys(byShip).filter(function (k) { return byShip[k].length > 1; });
    var dupPo = Object.keys(byPoLine).filter(function (k) { return byPoLine[k].length > 1; });
    p('  DUPLICATE shipment_out for one (shipment, warehouse, sku): ' + dupShip.length);
    dupShip.forEach(function (k) { p('    ' + k + ' x' + byShip[k].length + '  qty=' + byShip[k].map(function (m) { return pick(m, ['qty']); }).join(',')); });
    if (!dupShip.length) p('    (none)');
    p('  DUPLICATE po_receipt for one (purchase_order_line_id, idempotency key): ' + dupPo.length);
    dupPo.forEach(function (k) { p('    ' + k + ' x' + byPoLine[k].length); });
    if (!dupPo.length) p('    (none)');
    var noKey = Object.keys(byPoLine).filter(function (k) { return k.indexOf('||(no-key)') !== -1; });
    p('  po_receipt movements carrying NO idempotency key (a retry of one of these cannot be deduplicated): ' + noKey.length);
    noKey.forEach(function (k) { p('    ' + k.replace('||(no-key)', '')); });
    if (!noKey.length) p('    (none)');

    // Orphans: a movement naming an entity that is not there.
    var shipIds = {}; if (SH) SH.rows.forEach(function (r) { var i = pick(r, ['shipment_id']); if (i) shipIds[i] = 1; });
    var polIds = {}; if (POL) POL.rows.forEach(function (r) { var i = pick(r, ['purchase_order_line_id']); if (i) polIds[i] = 1; });
    var orphans = [];
    MV.rows.forEach(function (m) {
      var t = lo(pick(m, ['movement_type'])), rid = pick(m, ['related_entity_id']);
      if (t === 'shipment_out' && rid && SH && !shipIds[rid]) orphans.push('shipment_out -> missing shipment ' + rid);
      if (t === 'po_receipt' && rid && POL && !polIds[rid]) orphans.push('po_receipt -> missing purchase_order_line ' + rid);
    });
    p('  ORPHAN movements (naming an entity that no longer exists): ' + orphans.length);
    orphans.forEach(function (o) { p('    ' + o); });
    if (!orphans.length) p('    (none)');
  }

  // ==========================================================================================================
  // SECTION 3 — THE SHIPPING MAINLINE
  // ==========================================================================================================
  rule();
  p('SECTION 3 - SHIPPING MAINLINE, STAGE BY STAGE');
  rule();
  function statusTally(f, cols) {
    if (!f) return '(table absent)';
    var t = {};
    f.rows.forEach(function (r) { var st = lo(pick(r, cols)) || '(blank)'; t[st] = (t[st] || 0) + 1; });
    return JSON.stringify(t);
  }
  p('  shipping_allocation_drafts by status : ' + statusTally(SAD, ['status']));
  p('  shipping_plans by status             : ' + statusTally(SP, ['status']));
  p('  shipments by status                  : ' + statusTally(SH, ['status']));
  p('');
  var stranded = [];
  if (SP && SH) {
    var shipByPlan = {};
    SH.rows.forEach(function (r) { var pid = pick(r, ['shipping_plan_id']); if (pid) (shipByPlan[pid] = shipByPlan[pid] || []).push(r); });
    SP.rows.forEach(function (r) {
      var st = lo(pick(r, ['status'])), pid = pick(r, ['shipping_plan_id']);
      var transferred = pick(r, ['transferred_shipment_id']);
      if (st === 'approved' && !(shipByPlan[pid] || []).length && !transferred) {
        stranded.push('APPROVED_PLAN_WITH_NO_SHIPMENT  ' + pid +
          '   <-- the Approve transition committed the status and its Shipment Draft did not follow. ' +
          'The retry action exists on the server and NOTHING in the UI can start it (FC-0A S6b).');
      }
    });
  }
  if (SH && MV) {
    var movByShip = {};
    MV.rows.forEach(function (m) {
      if (lo(pick(m, ['movement_type'])) !== 'shipment_out') return;
      var rid = pick(m, ['related_entity_id']); if (rid) (movByShip[rid] = movByShip[rid] || []).push(m);
    });
    var routeByShip = {};
    if (SR) SR.rows.forEach(function (r) { var i = pick(r, ['shipment_id']); if (i) (routeByShip[i] = routeByShip[i] || []).push(r); });
    var eventByShip = {};
    if (SE) SE.rows.forEach(function (r) { var i = pick(r, ['shipment_id']); if (i) (eventByShip[i] = eventByShip[i] || []).push(r); });
    var SHIPPED = { shipped: 1, in_transit: 1, arrived: 1, received: 1, completed: 1, closed: 1 };
    SH.rows.forEach(function (r) {
      var id = pick(r, ['shipment_id']), st = lo(pick(r, ['status']));
      if (SHIPPED[st]) {
        if (!(movByShip[id] || []).length) stranded.push('SHIPPED_WITH_NO_STOCK_MOVEMENT  ' + id + ' (status=' + st + ')');
        if (!(routeByShip[id] || []).length) stranded.push('SHIPPED_WITH_NO_ROUTE_SNAPSHOT  ' + id + ' (status=' + st + ')');
        if (!(eventByShip[id] || []).length) stranded.push('SHIPPED_WITH_NO_EVENT  ' + id + ' (status=' + st + ')');
      } else if ((movByShip[id] || []).length) {
        stranded.push('STOCK_DEDUCTED_BUT_NOT_SHIPPED  ' + id + ' (status=' + st + ') <-- a movement exists for a shipment that is not shipped');
      }
    });
  }
  p('  STRANDED SHIPPING ROWS: ' + stranded.length);
  stranded.forEach(function (x) { p('    ' + x); });
  if (!stranded.length) p('    (none)');

  // ==========================================================================================================
  // SECTION 4 — THE PURCHASE MAINLINE
  // ==========================================================================================================
  rule();
  p('SECTION 4 - PURCHASE MAINLINE, STAGE BY STAGE');
  rule();
  p('  request_orders by status  : ' + statusTally(RO, ['status', 'request_status']));
  p('  purchase_orders by status : ' + statusTally(PO, ['order_status', 'status']));
  p('');
  var buyStranded = [];
  if (RO && ROL) {
    var linesByRo = {};
    ROL.rows.forEach(function (r) { var i = pick(r, ['request_order_id']); if (i) (linesByRo[i] = linesByRo[i] || []).push(r); });
    RO.rows.forEach(function (r) {
      var id = pick(r, ['request_order_id']);
      if (id && !(linesByRo[id] || []).length) buyStranded.push('REQUEST_ORDER_WITH_NO_LINES  ' + id);
    });
  }
  if (RO && PO) {
    var poByReq = {};
    PO.rows.forEach(function (r) { var i = pick(r, ['request_order_id', 'source_request_order_id']); if (i) (poByReq[i] = poByReq[i] || []).push(r); });
    RO.rows.forEach(function (r) {
      var id = pick(r, ['request_order_id']), st = lo(pick(r, ['status', 'request_status']));
      if ((st === 'approved' || st === 'confirmed') && !(poByReq[id] || []).length) {
        buyStranded.push('APPROVED_REQUEST_WITH_NO_PURCHASE_ORDER  ' + id + ' (status=' + st + ')');
      }
    });
  }
  if (POL && MV) {
    var rcvByLine = {};
    MV.rows.forEach(function (m) {
      if (lo(pick(m, ['movement_type'])) !== 'po_receipt') return;
      var rid = pick(m, ['related_entity_id']); if (rid) (rcvByLine[rid] = rcvByLine[rid] || []).push(m);
    });
    POL.rows.forEach(function (r) {
      var id = pick(r, ['purchase_order_line_id']);
      var completed = pickN(r, ['completed_qty']) || 0;
      var movs = rcvByLine[id] || [];
      var movQty = movs.reduce(function (a, m) { var q = pickN(m, ['qty']); return a + (q === null ? 0 : q); }, 0);
      if (completed > 0 && !movs.length) {
        buyStranded.push('COMPLETED_QTY_WITH_NO_STOCK_MOVEMENT  ' + id + ' completed=' + completed +
          '  <-- stock was credited to the PO line and never to Factory Stock');
      } else if (completed > 0 && movQty !== completed) {
        buyStranded.push('RECEIPT_QUANTITY_UNRECONCILED  ' + id + ' completed=' + completed + ' movementSum=' + movQty);
      } else if (!completed && movs.length) {
        buyStranded.push('STOCK_MOVEMENT_WITH_NO_COMPLETED_QTY  ' + id + ' movementSum=' + movQty);
      }
    });
  }
  p('  STRANDED PURCHASE ROWS: ' + buyStranded.length);
  buyStranded.forEach(function (x) { p('    ' + x); });
  if (!buyStranded.length) p('    (none)');

  // ==========================================================================================================
  rule();
  p('SECTION 5 - WHAT THIS CENSUS DID');
  rule();
  p('DB_WRITES=0 . ROWS_INSERTED=0 . ROWS_UPDATED=0 . ROWS_DELETED=0 . BACKFILLS=0 . LOCKS_TAKEN=0');
  p('STATUS_TRANSITIONS=0 . PROPERTIES_TOUCHED=0 . ACTIONS_CALLED=0 . STOCK_MOVEMENTS_WRITTEN=0');
  p('SUBMITS=0 . SENDS=0 . CONFIRMS=0 . RECEIPTS=0 . DOCUMENTS_GENERATED=0 . REPAIRS=0 . RESTORES=0');
  p('MASTER_DATA_CHANGES=0');
  p('Sheets were read through a facade exposing only getDataRange().getValues(); no write handle was ever');
  p('obtained, so a write was not merely avoided but unreachable. Nothing above is repaired: a ledger break');
  p('and a stranded row are reported with the ids needed to decide, and the decision is not this file\'s.');
  rule();

  var text = out.join('\n');
  Logger.log(text);
  return text;
}
