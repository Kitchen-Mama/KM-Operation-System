// ================================================================================================================
// F1-7N-FC-1A-R1 — RESERVATION RELEASE / SHIPMENT CANCELLATION / MOVEMENT VOCABULARY / PO OVER-RECEIPT
// ----------------------------------------------------------------------------------------------------------------
// WHY THIS ROUND EXISTS, stated once so the assertions below read as consequences rather than a checklist.
//
// FC-1A made Shipment Draft creation ACQUIRE a factory stock reservation and shipped with NO routed way to
// release one before dispatch. That is not a missing feature; it is a state a reservation can enter and never
// leave. Units stay held by a draft nobody can cancel, availability drops permanently, and the only symptom an
// operator ever sees is a shipment refused for stock that is physically on the floor.
//
// This suite EXECUTES the shipped handlers over in-memory sheets that count every mutation per table:
//   * 12_'s real handleCancelShipmentDraft_ over 21_'s real shared stock transaction
//   * 11_'s real approve over 12_'s real creation over the SAME 21_ core (so cancel -> retry is end to end)
//   * 22_'s real dispatch over the SAME core (so the cancel/dispatch guards are measured, not read)
//   * 13_'s real receipt over the SAME core (the over-receipt refusal)
//   * 21_'s real factoryStockReconcileReservations_ (the reconciliation, which the TEMP diagnostic also calls,
//     so there is exactly ONE arithmetic and no second opinion to disagree with it)
//
// Mutation counters are what make the negative claims checkable. "A replay writes nothing" and "a refusal
// writes nothing" are not readable properties of source; they are counts.
// ================================================================================================================
var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
// A mutation must APPLY and be CAUGHT. A probe that cannot find its target is a PROBE ERROR, never a pass — a
// mutation test that silently stops mutating is worse than no mutation test.
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
var GS_DIR = path.join(ROOT, 'assets/specs/active/apps-script');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
var NL = String.fromCharCode(10);

var G01 = read('assets/specs/active/apps-script/01_router.gs');
var G11 = read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs');
var G12 = read('assets/specs/active/apps-script/12_shipment_handlers.gs');
var G13 = read('assets/specs/active/apps-script/13_procurement_handlers.gs');
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G21 = read('assets/specs/active/apps-script/21_factory_inventory_handlers.gs');
var G22 = read('assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs');
var G31 = read('assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var SHPAGE = read('assets/js/pages/shipping-history.js');
var SPPAGE = read('assets/js/pages/shipping-plan.js');
var RECON = read('assets/tools/apps-script-diagnostics/TEMP_FC1AR1_RESERVATION_RECONCILIATION.gs');

var GS_FILES = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f) && f.indexOf('90_generated') !== 0; });
var GS_SRC = {};
GS_FILES.forEach(function (f) { GS_SRC[f] = fs.readFileSync(path.join(GS_DIR, f), 'utf8'); });

function extractFn(src, name) {
  var i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('function not found: ' + name);
  var d = 0, started = false;
  for (var j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
// Line endings are NOT uniform here (12_ and 13_ are CRLF; 21_, 22_ and the pages are LF), so the newline form
// is normalised once rather than in forty call sites. A mutation that cannot match its target proves nothing.
function mutateFn(src, name, find, replace) {
  var body = extractFn(src, name);
  var nl = body.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  var f = find.split('\n').join(nl), r = replace.split('\n').join(nl);
  if (body.indexOf(f) === -1) throw new Error('mutation target absent in ' + name + ': ' + find.slice(0, 90));
  return src.replace(body, body.replace(f, r));
}

// ================================================================================================================
// THE IN-MEMORY WORLD. Every mutation COUNTED per table.
// ================================================================================================================
function MemSheet(name, grid) { this.__n = name; this.g = grid.map(function (r) { return r.slice(); }); this.appends = 0; this.writes = 0; this.deletes = 0; }
MemSheet.prototype.getName = function () { return this.__n; };
MemSheet.prototype.getDataRange = function () { var s = this; return { getValues: function () { return s.g.map(function (r) { return r.slice(); }); } }; };
MemSheet.prototype.getLastColumn = function () { return this.g.length ? this.g[0].length : 0; };
MemSheet.prototype.getLastRow = function () { return this.g.length; };
MemSheet.prototype.appendRow = function (row) { this.g.push(row.slice()); this.appends++; };
MemSheet.prototype.deleteRow = function (r) { this.g.splice(r - 1, 1); this.deletes++; };
MemSheet.prototype.insertColumnAfter = function () {};
MemSheet.prototype.mutations = function () { return this.appends + this.writes + this.deletes; };
MemSheet.prototype.getRange = function (r, c, nr, nc) {
  var s = this; nr = nr || 1; nc = nc || 1;
  return {
    getValues: function () { var o = []; for (var i = 0; i < nr; i++) { var row = s.g[r - 1 + i] || []; o.push(row.slice(c - 1, c - 1 + nc)); } return o; },
    getValue: function () { return (s.g[r - 1] || [])[c - 1]; },
    setValue: function (v) { if (!s.g[r - 1]) s.g[r - 1] = []; s.g[r - 1][c - 1] = v; s.writes++; },
    setValues: function (vs) { vs.forEach(function (rw, i) { if (!s.g[r - 1 + i]) s.g[r - 1 + i] = []; for (var j = 0; j < rw.length; j++) s.g[r - 1 + i][c - 1 + j] = rw[j]; }); s.writes += vs.length; }
  };
};
function gridOf(headers, objs) {
  var g = [headers.slice()];
  (objs || []).forEach(function (o) { g.push(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; })); });
  return g;
}
function objsOf(sheet) {
  var h = (sheet.g[0] || []).map(function (x) { return String(x).trim(); });
  return sheet.g.slice(1).map(function (r) { var o = {}; for (var i = 0; i < h.length; i++) if (h[i]) o[h[i]] = r[i]; return o; });
}
// ONE uuid counter for the whole suite. Each buildRunner used to close over its own, so a shipment created
// by the approve runner and a shipment created by the retry runner both came out as SH-UUID-0001 — and
// "cancel then retry produces a DIFFERENT shipment" could not be measured at all.
var UUID_N = 0;
function gasServices(lockAvailable) {
  return {
    Utilities: { getUuid: function () { UUID_N++; return 'uuid-' + ('0000' + UUID_N).slice(-4) + '-r1-0000-000000000000'; },
      formatDate: function () { return '2026-09-03'; } },
    Session: { getScriptTimeZone: function () { return 'Asia/Taipei'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return lockAvailable !== false; }, releaseLock: function () {} }; } },
    Logger: { log: function () {} }
  };
}
function jsonResponseStub(o) { return o; }
function appendByHeader(sh, obj) {
  var h = (sh.g[0] || []).map(function (x) { return String(x).trim(); });
  sh.appendRow(h.map(function (k) { return Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : ''; }));
}
function readSheetStub(sh) {
  var vals = sh.getDataRange().getValues();
  var h = (vals[0] || []).map(function (x) { return String(x).trim(); });
  return { rows: vals, headers: h, col: function (n) { return h.indexOf(n); } };
}

var FS_H = ['factory_stock_id', 'warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock', 'updated_at', 'last_transaction_at'];
var MOV_H = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty',
  'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
  'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
var PLAN_H = ['shipping_plan_id', 'shipping_plan_no', 'status', 'company', 'country', 'marketplace', 'ship_from',
  'source_warehouse_id', 'destination', 'destination_warehouse_id', 'destination_type', 'shipping_method',
  'last_mile_delivery', 'customs_type', 'import_duty_treatment', 'carrier_id', 'rate_card_id', 'currency',
  'plan_version', 'note', 'submitted_by', 'submitted_at', 'approved_by', 'approved_at', 'rejected_by',
  'rejected_at', 'rejected_reason', 'cancelled_by', 'cancelled_at', 'completed_at',
  'parent_shipping_plan_id', 'transferred_to_shipment_at', 'transferred_shipment_id', 'updated_by', 'updated_at'];
var PLINE_H = ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'requested_qty', 'approved_qty',
  'plan_carton_qty', 'units_per_carton', 'carton_cbm', 'cbm', 'gross_weight', 'net_weight', 'note',
  'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply', 'snapshot_suggested_qty',
  'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context', 'snapshot_avg_sales_source',
  'snapshot_avg_sales_warning', 'updated_at'];
var SHIP_H = ['shipment_id', 'shipment_no', 'external_shipment_id', 'shipping_plan_id', 'status', 'company',
  'country', 'marketplace', 'ship_from', 'source_warehouse_id', 'destination', 'destination_warehouse_id',
  'destination_type', 'shipping_method', 'last_mile_delivery', 'shipments_customs_type', 'import_duty_treatment',
  'carrier_id', 'rate_card_id', 'currency', 'reference_id', 'warehouse_code', 'warehouse_id', 'etd', 'eta',
  'shipment_total_qty', 'total_qty', 'shipment_total_cartons', 'shipment_total_cbm', 'shipment_total_gross_weight',
  'shipment_total_net_weight', 'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee',
  'estimated_total_cost', 'estimated_unit_cost', 'route_template_id', 'shipped_at', 'shipped_by',
  'actual_departure_date', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note', 'created_by', 'created_at',
  'updated_by', 'updated_at'];
var SLINE_H = ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty', 'qty', 'shipping_plan_line_id',
  'shipment_carton_qty', 'carton_qty', 'units_per_carton', 'shipment_carton_cbm', 'gross_weight', 'net_weight',
  'note', 'carton_no_start', 'carton_no_end', 'shipped_qty', 'created_at', 'updated_at'];
var ROUTE_T_H = ['route_template_id', 'template_name', 'destination', 'carrier_id', 'shipping_method', 'is_active'];
var ROUTE_N_H = ['route_template_node_id', 'route_template_id', 'sequence_no', 'node_type', 'node_code',
  'location_name', 'country', 'region', 'city', 'latitude', 'longitude', 'transport_mode', 'planned_event_type',
  'offset_days', 'logistics_location_id'];

function world(opts) {
  opts = opts || {};
  var sheets = {
    shipping_plans: new MemSheet('shipping_plans', gridOf(PLAN_H, opts.plans === undefined ? [{
      shipping_plan_id: 'SP-1', shipping_plan_no: 'WSP-1', status: 'pending_approval',
      company: 'Res US', country: 'US', marketplace: 'Amazon', ship_from: 'CNYOUXIN',
      source_warehouse_id: 'WH-F', destination: 'US3PL01', destination_warehouse_id: 'WH-US-3PL-01',
      destination_type: 'warehouse', shipping_method: 'sea', last_mile_delivery: 'ltl',
      carrier_id: 'CR-1', currency: 'USD', plan_version: 1
    }] : opts.plans)),
    shipping_plan_lines: new MemSheet('shipping_plan_lines', gridOf(PLINE_H, opts.planLines === undefined ? [
      { shipping_plan_line_id: 'SPL-1', shipping_plan_id: 'SP-1', sku: 'CO1100-R',
        requested_qty: 800, approved_qty: 800, plan_carton_qty: 40, units_per_carton: 20, cbm: 4 }
    ] : opts.planLines)),
    shipments: new MemSheet('shipments', gridOf(SHIP_H, opts.shipments || [])),
    shipment_lines: new MemSheet('shipment_lines', gridOf(SLINE_H, opts.shipmentLines || [])),
    shipment_routes: new MemSheet('shipment_routes', gridOf(['shipment_route_id', 'shipment_id'], opts.routes || [])),
    shipment_events: new MemSheet('shipment_events', gridOf(['shipment_event_id', 'shipment_id'], opts.events || [])),
    shipment_route_templates: new MemSheet('shipment_route_templates', gridOf(ROUTE_T_H, [
      { route_template_id: 'RT-1', template_name: 'CN-US', destination: 'US3PL01', carrier_id: 'CR-1', shipping_method: 'sea', is_active: 'TRUE' }
    ])),
    shipment_route_template_nodes: new MemSheet('shipment_route_template_nodes', gridOf(ROUTE_N_H, [
      { route_template_node_id: 'RTN-1', route_template_id: 'RT-1', sequence_no: 1, node_type: 'origin', node_code: 'CNYOUXIN', location_name: 'Youxin', country: 'CN', offset_days: 0 },
      { route_template_node_id: 'RTN-2', route_template_id: 'RT-1', sequence_no: 2, node_type: 'destination', node_code: 'US3PL01', location_name: 'US 3PL', country: 'US', offset_days: 30 }
    ])),
    factory_stock: new MemSheet('factory_stock', gridOf(FS_H, opts.stock === undefined ? [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 0 }
    ] : opts.stock)),
    factory_stock_movements: new MemSheet('factory_stock_movements', gridOf(MOV_H, opts.movements || []))
  };
  return {
    sheets: sheets,
    ss: { getId: function () { return 'DBID-R1'; },
      getSheetByName: function (n) { return sheets[n] || null; },
      insertSheet: function (n) { sheets[n] = new MemSheet(n, [[]]); return sheets[n]; } },
    counts: function () { var c = {}; Object.keys(sheets).forEach(function (n) { c[n] = sheets[n].mutations(); }); return c; },
    mutated: function () { return Object.keys(sheets).filter(function (n) { return sheets[n].mutations() > 0; }).sort(); },
    stock: function () { return objsOf(sheets.factory_stock); },
    movements: function () { return objsOf(sheets.factory_stock_movements); },
    plans: function () { return objsOf(sheets.shipping_plans); },
    shipments: function () { return objsOf(sheets.shipments); },
    shipmentLines: function () { return objsOf(sheets.shipment_lines); },
    reserved: function (wh, sku) {
      var r = objsOf(sheets.factory_stock).filter(function (x) {
        return String(x.warehouse_id) === (wh || 'WH-F') && String(x.sku) === (sku || 'CO1100-R'); })[0];
      return r ? Number(r.fac_reserved_stock) : 0;
    },
    current: function (wh, sku) {
      var r = objsOf(sheets.factory_stock).filter(function (x) {
        return String(x.warehouse_id) === (wh || 'WH-F') && String(x.sku) === (sku || 'CO1100-R'); })[0];
      return r ? Number(r.fac_current_stock) : 0;
    }
  };
}

// A live shipment holding an 800-unit reservation. This is the fixture the whole cancellation story needs.
function reservedShipment(opts) {
  opts = opts || {};
  return world({
    plans: [{ shipping_plan_id: 'SP-1', status: 'approved', source_warehouse_id: 'WH-F', company: 'Res US',
      country: 'US', marketplace: 'Amazon', approved_by: 'op', approved_at: '2026-09-01',
      transferred_shipment_id: 'SHP-1', transferred_to_shipment_at: '2026-09-01' }],
    shipments: [Object.assign({
      shipment_id: 'SHP-1', shipping_plan_id: 'SP-1', status: 'ready_to_ship', external_shipment_id: 'EXT-1',
      reference_id: 'REF-1', warehouse_code: 'US3PL01', carrier_id: 'CR-1', shipping_method: 'sea',
      etd: '2026-09-10', eta: '2026-10-10', shipment_total_qty: 800, total_qty: 800, ship_from: 'CNYOUXIN',
      destination: 'US3PL01', destination_warehouse_id: 'WH-US-3PL-01', source_warehouse_id: 'WH-F',
      route_template_id: 'RT-1'
    }, opts.shipment || {})],
    shipmentLines: [{ shipment_line_id: 'SL-1', shipment_id: 'SHP-1', sku: 'CO1100-R', shipment_qty: 800,
      shipment_carton_qty: 40, units_per_carton: 20 }],
    stock: opts.stock || [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 }],
    movements: opts.movements || [{ factory_stock_movement_id: 'FSMV-A', movement_date: '2026-09-01',
      sku: 'CO1100-R', warehouse_id: 'WH-F', movement_type: 'reservation_acquire', qty: 800,
      related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 }],
    routes: opts.routes || [], events: opts.events || []
  });
}

// 21_'s shared authority as source, so a mutated copy can replace it.
function core21(src) {
  var g = src || G21;
  return [
    extractFn(g, 'factoryStockApplyDeltaTx_'),
    extractFn(g, 'factoryStockRollbackJournal_'),
    extractFn(g, 'factoryStockReadBalanceTx_'),
    extractFn(g, 'factoryStockOwnerReservedTx_'),
    extractFn(g, 'factoryStockAcquireReservationTx_'),
    extractFn(g, 'factoryStockReleaseReservationTx_'),
    extractFn(g, 'factoryStockIsKnownMovementType_'),
    extractFn(g, 'factoryStockIsReservationMovement_'),
    extractFn(g, 'factoryStockIsCurrentMovement_'),
    extractFn(g, 'factoryStockReconcileReservations_'),
    (g.match(/var FSTX_MOV_[A-Z_]+ = '[a-z_]+';/g) || []).join(NL),
    (g.match(/var FSTX_MOVEMENT_TYPES_ = \[[\s\S]*?\];/) || [''])[0],
    (g.match(/var FSTX_RESERVED_AXIS_TYPES_ = \[[^\]]*\];/) || [''])[0],
    (g.match(/var FSTX_CURRENT_AXIS_TYPES_ = \[[\s\S]*?\];/) || [''])[0],
    "var FSTX_RESERVATION_OWNER_TYPE_ = 'shipment';"
  ].join(NL);
}

// SUPPLIED dependencies, each named so the boundary of what is real is visible. None of them touches a
// factory_stock balance, a shipment status or a plan status — which is what every assertion below measures.
function buildRunner(srcParts, exportExpr, opts) {
  opts = opts || {};
  var svc = gasServices(opts.lockAvailable);
  var argNames = ['Utilities', 'Session', 'SpreadsheetApp', 'LockService', 'Logger', 'jsonResponse_',
    'sheetEnsureColumns_', 'shipmentValidateCartons_', 'fcWriteEnsureSheet_', 'fcWriteEnsureColumns_',
    'fcWriteAppendByHeader_', 'shippingPlanEffectiveOwnerIds_', 'shippingPlanSkuLogisticsMap_',
    'procurementFindRow_', 'slaPrepareExecution_', 'slaApplyExecution_', 'shipmentReadSheet_',
    'dgsShipmentReadiness_', 'dgsGenerateShipmentDocuments_', 'shipmentTimestamp_', 'shipmentToday_',
    'prodRequireSheet_', 'shippingMatchRateCards_', 'shippingFreight_', 'shippingDuty_', 'shippingCustomsFee_',
    'shippingBatteryClass_'];
  var body = 'var OUT;' + srcParts.join(NL) + NL + 'OUT = (' + exportExpr + '); return OUT;';
  var fn = Function.apply(null, argNames.concat([body]));
  return function (w, arg) {
    var f = fn.apply(null, [
      svc.Utilities, svc.Session,
      { flush: function () {}, getActiveSpreadsheet: function () { return w.ss; } },
      svc.LockService, svc.Logger, jsonResponseStub,
      function () {},                                                    // sheetEnsureColumns_
      function () { return { ok: true }; },                              // shipmentValidateCartons_
      function (ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); },
      function () {},                                                    // fcWriteEnsureColumns_
      appendByHeader,
      function (ss, id) { return [id]; },                                // shippingPlanEffectiveOwnerIds_
      function () { return {}; },                                        // shippingPlanSkuLogisticsMap_
      function (sheet, colName, id) {                                    // procurementFindRow_
        var vals = sheet.getDataRange().getValues();
        var h = (vals[0] || []).map(function (x) { return String(x).trim(); });
        var c = h.indexOf(colName);
        if (c === -1) return null;
        for (var i = 1; i < vals.length; i++) {
          if (String(vals[i][c]).trim() === String(id).trim()) {
            return { row: i + 1, vals: vals[i], col: function (n) { return h.indexOf(n); } };
          }
        }
        return null;
      },
      function () { return { ok: true, plan: [] }; },                    // slaPrepareExecution_ (32_)
      function () { return { ok: true, applied: [] }; },                 // slaApplyExecution_ (32_)
      readSheetStub,                                                     // shipmentReadSheet_
      function () { return { ok: true, status: 'READY', blockers: [] }; },// dgsShipmentReadiness_ (39_)
      function () { return { ok: true, generated: [] }; },               // dgsGenerateShipmentDocuments_ (39_)
      function () { return '2026-09-03 12:00:00'; },                     // shipmentTimestamp_
      function () { return '2026-09-03'; },                              // shipmentToday_
      function (ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); },  // prodRequireSheet_ (29_)
      function () { return []; }, function () { return 0; }, function () { return 0; },
      function () { return 0; }, function () { return ''; }
    ]);
    try { return f(arg); } catch (e) { return { success: false, threw: true, error: String(e && e.message) }; }
  };
}

// 12_ reaches 22_'s dispatch-evidence helpers via typeof guards, so 22_ is loaded alongside it: the guard this
// suite measures is the REAL one, not a stub that would agree with whatever it was asked.
function cancelParts(g12, g21, g22) {
  return [(g12 || G12), (g22 || G22), core21(g21)];
}
function runCancel(w, body, g12, g21, g22, opts) {
  return buildRunner(cancelParts(g12, g21, g22), 'handleCancelShipmentDraft_', opts)(w, body);
}
function runUpdateShipment(w, body, g12, g21) {
  return buildRunner([(g12 || G12), (G22), core21(g21)], 'handleUpdateShipment_')(w, body);
}
function runConfirm(w, body, g22, g21) {
  return buildRunner([(g22 || G22), core21(g21)], 'handleConfirmShipmentAndDispatch_')(w, body);
}
function runApprove(w, body, g11, g12, g21) {
  return buildRunner([
    extractFn(g11 || G11, 'shippingPlanTimestamp_'),
    extractFn(g11 || G11, 'handleUpdateShippingPlanStatus_'),
    extractFn(g11 || G11, 'spApprovalRecoveryState_'),
    (g12 || G12), G22, core21(g21)
  ], 'handleUpdateShippingPlanStatus_')(w, body);
}
function runRetry(w, body, g12, g21) {
  return buildRunner([(g12 || G12), G22, core21(g21)], 'handleCreateShipmentFromPlan_')(w, body);
}

// The 21_ primitives, callable directly.
var prim = (function () {
  var svc = gasServices();
  return new Function('Utilities', 'SpreadsheetApp', 'fcWriteAppendByHeader_',
    'var OUT;' + core21() + NL + 'return { acquire: factoryStockAcquireReservationTx_,' +
    ' release: factoryStockReleaseReservationTx_, balance: factoryStockReadBalanceTx_,' +
    ' owner: factoryStockOwnerReservedTx_, reconcile: factoryStockReconcileReservations_,' +
    ' isRes: factoryStockIsReservationMovement_, isCur: factoryStockIsCurrentMovement_,' +
    ' isKnown: factoryStockIsKnownMovementType_, TYPES: FSTX_MOVEMENT_TYPES_ };')(
    svc.Utilities, { flush: function () {} }, appendByHeader);
})();

// ================================================================================================================
section('§B — PRECONDITIONS AND RELEASE IDENTITY');
// ================================================================================================================
(function () {
  var RO = require('./_release-order.js');
  ok(RO.OWNER_STAMPS.indexOf('F1-7N-FC-1A') !== -1, 'B1  the FC-1A baseline is a registered owner stamp');
  ok(RO.OWNER_STAMPS.indexOf('F1-7N-FC-1A-R1') !== -1, 'B2  and R1 is registered after it');
  eq(RO.stampAtOrAfter(RO.OWNER_STAMPS[RO.OWNER_STAMPS.length - 1], 'F1-7N-FC-1A-R1'), true,
    'B3  R1 is at or after the newest stamp');
  // RESTATED (F1-7N-FC-1A-R1-HF1) — these two assertions defended a decision that was WRONG, and they
  // defended it correctly, which is why they kept passing. R1 reused FC-1A's token on the grounds that the two
  // rounds are ONE atomic release. They are, and it still does not follow: atomicity is enforced by the
  // ACTION-CONTRACT version, and a cache token decides only whether a browser refetches a file. FC-1A had
  // already been PUBLISHED (d94d5bd was pushed), so reusing its token left every browser holding the FC-1A
  // copy of shipping-history.js — a Shipment Draft card with no Cancel button — against a server
  // that routes cancelShipmentDraft. The floor is therefore STRICT: this round's frontend must not be served
  // under a token FC-1A's browsers already hold.
  ok(RO.tokenIndex(RO.currentAppToken()) > RO.tokenIndex('fc1a-shipmentrecovery-20260903'),
    'B4  §0 the cache token is STRICTLY AFTER FC-1A\'s, because FC-1A\'s was already published');
  ok(/A token may only be reused while nothing carrying it has been published/.test(read('assets/tests/_release-order.js')),
    'B4a and the release order still states the rule R1 broke');
  ok(/F1-7N-FC-1A-R1-HF1/.test(read('assets/tests/_release-order.js')),
    'B4b and RECORDS the correction rather than quietly rotating the token');
  var INDEX = read('index.html');
  var tok = (INDEX.match(new RegExp(RO.currentAppToken(), 'g')) || []).length;
  ok(tok >= 15, 'B5  index.html carries the current token on every versioned asset (' + tok + ' refs)');
})();

// ================================================================================================================
section('§C — THE CANCELLATION AUTHORITY AUDIT, MEASURED');
// ================================================================================================================
// The audit that decided whether to extend something or add one action. Four cancellation-shaped authorities
// exist; each is pinned here with the reason it cannot do this job, so a later round cannot re-litigate the
// decision from memory.
(function () {
  var routerActions = {};
  (code(G01).match(/action === '([^']+)'/g) || []).forEach(function (m) { routerActions[m.match(/'([^']+)'/)[1]] = 1; });

  // (a) PLAN cancellation exists — and cannot reach an approved plan, which is the only kind that has a draft.
  ok(!!routerActions['updateShippingPlanStatus'], 'C1  updateShippingPlanStatus is routed');
  var planCancel = code(G11).match(/transition === 'cancel'\)?\s*\{[\s\S]{0,400}/);
  ok(planCancel && /curStatus !== 'draft' && curStatus !== 'pending_approval'/.test(planCancel[0]),
    'C2  §C plan cancel is allowed ONLY from draft|pending_approval');
  ok(planCancel && !/approved/.test(planCancel[0].split('setCell')[0]),
    'C2a so an APPROVED plan — the only kind that HAS a Shipment Draft — cannot reach it');

  // (b)(c) two other cancel actions, both about different entities.
  ok(!!routerActions['cancelShippingAllocationDraft'], 'C3  cancelShippingAllocationDraft is routed (16_)');
  ok(/allocation_draft/.test(code(G16)) && !/factory_stock/.test(code(extractFn(G16, 'handleCancelShippingAllocationDraft_'))),
    'C3a and it cancels an Execution Plan allocation draft — it never touches factory stock');
  ok(!!routerActions['cancelRequestOrderTier'], 'C4  cancelRequestOrderTier is routed (13_, purchase mainline)');

  // (d) THE FINDING THAT MATTERED. updateShipment had NO status allowlist, so `status:'cancelled'` would have
  // been written straight through with ZERO reservation release. Not a missing feature: a REACHABLE path that
  // permanently strands units.
  ok(/USE_CANCEL_SHIPMENT_DRAFT/.test(code(G12)),
    'C5  §C updateShipment now REFUSES a cancel and names the action that does it properly');
  ok(/UNKNOWN_SHIPMENT_STATUS/.test(code(G12)),
    'C5a and refuses an unknown status too, so a typo cannot hide a shipment from every page that filters');

  // (e) THE NEW ACTION, and it is the ONLY new one.
  ok(!!routerActions['cancelShipmentDraft'], 'C6  §D cancelShipmentDraft is routed');
  var owners = GS_FILES.filter(function (f) { return /function handleCancelShipmentDraft_\(/.test(GS_SRC[f]); });
  eq(owners, ['12_shipment_handlers.gs'], 'C6a defined exactly ONCE, in the shipment owner');
  var cancelActions = Object.keys(routerActions).filter(function (a) { return /cancel/i.test(a); }).sort();
  eq(cancelActions, ['cancelRequestOrderTier', 'cancelShipmentDraft', 'cancelShippingAllocationDraft',
    'inventoryReplenishmentGap.job.cancel', 'orderPlanningGap.job.cancel', 'requestOrderDraft.job.cancel'],
    'C7  §C exactly ONE cancellation action was added — no duplicate of an existing authority');
})();

// ================================================================================================================
section('§D — CANCELLATION RELEASES THE RESERVATION, ATOMICALLY');
// ================================================================================================================
(function () {
  var w = reservedShipment();
  eq([w.current(), w.reserved()], [1000, 800], 'D0  precondition: 1000 on hand, 800 reserved by SHP-1');

  var r = runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'customer pushed the window' });
  eq(r.success, true, 'D1  §M.2 the cancellation succeeds');
  eq(r.data.outcome, 'CANCELLED', 'D1a and answers CANCELLED');
  eq(w.current(), 1000, 'D2  §D.4 current_stock is UNCHANGED — a cancellation returns a CLAIM, not units');
  eq(r.data.current_stock_changed, false, 'D2a and the answer says so explicitly');
  eq(w.reserved(), 0, 'D3  §D.4 fac_reserved_stock drops by the exact outstanding quantity');
  eq(Number(r.data.reservation_released), 800, 'D3a reported as 800');

  var rel = w.movements().filter(function (m) { return String(m.movement_type) === 'reservation_release'; });
  eq(rel.length, 1, 'D4  §D.4 exactly ONE reservation_release row, per warehouse/SKU owner');
  eq(Number(rel[0].qty), -800, 'D4a with a NEGATIVE qty — the reserved axis went down');
  eq([Number(rel[0].before_current_stock), Number(rel[0].after_current_stock)], [1000, 1000],
    'D4b the current pair is recorded as unchanged, not omitted');
  eq([Number(rel[0].before_reserved_stock), Number(rel[0].after_reserved_stock)], [800, 0],
    'D4c while the reserved pair carries the actual change');
  eq([String(rel[0].related_entity_type), String(rel[0].related_entity_id)], ['shipment', 'SHP-1'],
    'D4d owned by the shipment that held it');
  ok(/reason=shipment_draft_cancelled/.test(String(rel[0].note)), 'D4e and the reason is on the ledger row');

  var sh = w.shipments()[0];
  eq(String(sh.status), 'cancelled', 'D5  §D.6 the Shipment Draft transitions to cancelled');
  eq([String(sh.cancelled_by), String(sh.cancel_reason)], ['op', 'customer pushed the window'],
    'D6  §D.7 with who and why preserved');
  ok(String(sh.cancelled_at).length > 0, 'D6a and when');
  eq(w.shipments().length, 1, 'D7  §D nothing was deleted — the row is preserved as audit evidence');
  eq(w.shipmentLines().length, 1, 'D7a and so are its lines');
  eq(w.movements().length, 2, 'D7b the ledger keeps BOTH the acquire and the release');

  // §D.8/§D.9 — the parent plan.
  var p = w.plans()[0];
  eq(String(p.status), 'approved', 'D8  §D.8 the approved parent plan KEEPS its approval');
  eq(String(p.approved_by), 'op', 'D8a and who approved it');
  eq([String(p.transferred_shipment_id), String(p.transferred_to_shipment_at)], ['', ''],
    'D9  §D.9 but its handoff marker is CLEARED, which is what makes the parent derive pending again');
  eq(r.data.plan_execution_commit, 'APPROVED_SHIPMENT_CREATION_PENDING', 'D9a and the answer states that state');
  eq(r.data.plan_handoff_cleared, true, 'D9b explicitly');
})();

(function () {
  // §D.11 / §M.3 — REPLAY. A double click, a retried transport failure and a genuine replay must all converge
  // on ONE cancellation and ONE release.
  var w = reservedShipment();
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' });
  var before = w.counts();
  var r2 = runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' });
  eq(r2.success, true, 'D10 §D.11 a replayed cancel SUCCEEDS rather than erroring');
  eq(r2.data.outcome, 'REUSED', 'D10a and answers REUSED');
  eq(r2.data.already_cancelled, true, 'D10b saying so');
  eq(w.counts(), before, 'D11 §D.11 and changes ZERO cells in EVERY table');
  eq([w.current(), w.reserved()], [1000, 0], 'D11a the balance is exactly where the first cancel left it');
  eq(w.movements().filter(function (m) { return String(m.movement_type) === 'reservation_release'; }).length, 1,
    'D11b released exactly ONCE — never twice');
})();

(function () {
  // §D.12 / §M.4 — FAILURE ROLLS BACK. The plan-handoff clear runs AFTER the release and the status write, so
  // it is exactly where a half-applied cancellation would appear. The release primitive is made to throw on
  // its SECOND call, after the first has already written.
  var w = reservedShipment({
    stock: [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 500 },
      { factory_stock_id: 'FS-2', warehouse_id: 'WH-F', sku: 'CO2200-B', fac_current_stock: 1000, fac_reserved_stock: 300 }
    ],
    movements: [
      { factory_stock_movement_id: 'M1', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
        movement_type: 'reservation_acquire', qty: 500, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
        before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 500 },
      { factory_stock_movement_id: 'M2', movement_date: '2026-09-01', sku: 'CO2200-B', warehouse_id: 'WH-F',
        movement_type: 'reservation_acquire', qty: 300, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
        before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 300 }
    ]
  });
  var callN = 0;
  var g21 = mutateFn(G21, 'factoryStockReleaseReservationTx_',
    "  var give = Math.min(want, held);",
    "  var give = Math.min(want, held);\n  if (++FSTX_TEST_CALLS_ > 1) throw new Error('INJECTED_SECOND_RELEASE_FAILURE');");
  var parts = cancelParts(null, g21, null);
  parts.unshift('var FSTX_TEST_CALLS_ = 0;');
  var r = buildRunner(parts, 'handleCancelShipmentDraft_')(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' });
  eq(r.success, false, 'D12 §D.12 the cancellation fails');
  eq(String(r.code), 'CANCEL_ROLLED_BACK', 'D12a and says it was rolled back');
  eq([w.reserved('WH-F', 'CO1100-R'), w.reserved('WH-F', 'CO2200-B')], [500, 300],
    'D13 §D.12 BOTH reserved balances came back — the first release was undone with the second');
  eq(w.movements().filter(function (m) { return String(m.movement_type) === 'reservation_release'; }).length, 0,
    'D14 §D.12 no release row survives');
  eq(String(w.shipments()[0].status), 'ready_to_ship', 'D15 §D.12 and the shipment is still active');
  eq(String(w.plans()[0].transferred_shipment_id), 'SHP-1', 'D15a with its plan handoff intact');
})();

(function () {
  // §D.2 / §M.5 — CANCEL AFTER DISPATCH IS REFUSED, on status AND on physical evidence, with zero writes.
  var shipped = reservedShipment({ shipment: { status: 'shipped' },
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 200, fac_reserved_stock: 0 }],
    movements: [{ factory_stock_movement_id: 'M1', movement_date: '2026-09-02', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'shipment_out', qty: -800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 200, before_reserved_stock: 800, after_reserved_stock: 0 }] });
  var before = shipped.counts();
  var r = runCancel(shipped, { shipment_id: 'SHP-1', actor: 'op', reason: 'too late' });
  eq(r.success, false, 'D16 §M.5 cancelling a SHIPPED shipment is refused');
  eq(String(r.code), 'SHIPMENT_ALREADY_DISPATCHED', 'D16a by name');
  eq(shipped.counts(), before, 'D17 §M.5 with ZERO writes anywhere');
  eq([shipped.current(), shipped.reserved()], [200, 0], 'D17a and the post-dispatch balance is untouched');

  // Physical evidence ALONE is enough, even when the status still reads pre-dispatch. This is the interrupted
  // Confirm: the deduction landed and the status write did not.
  var interrupted = reservedShipment({
    shipment: { status: 'ready_to_ship' },
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 200, fac_reserved_stock: 0 }],
    movements: [{ factory_stock_movement_id: 'M1', movement_date: '2026-09-02', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'shipment_out', qty: -800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 200, before_reserved_stock: 800, after_reserved_stock: 0 }] });
  var b2 = interrupted.counts();
  var r2 = runCancel(interrupted, { shipment_id: 'SHP-1', actor: 'op', reason: 'x' });
  eq(String(r2.code), 'SHIPMENT_ALREADY_DISPATCHED',
    'D18 §D.2 a shipment_out movement alone refuses the cancel even while the STATUS still reads ready_to_ship');
  eq(interrupted.counts(), b2, 'D18a writing nothing');

  // A route row alone is also enough.
  var routed = reservedShipment({ routes: [{ shipment_route_id: 'SRN-1', shipment_id: 'SHP-1' }] });
  var r3 = runCancel(routed, { shipment_id: 'SHP-1', actor: 'op', reason: 'x' });
  eq(String(r3.code), 'SHIPMENT_ALREADY_DISPATCHED', 'D19 §D.2 and so does an existing route snapshot');
  eq(routed.reserved(), 800, 'D19a the reservation is left exactly as it was');
})();

(function () {
  // §D — the guards that protect the operator from acting on a stale card, and from a status nobody understands.
  var w = reservedShipment();
  var before = w.counts();
  var stale = runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r', expected_status: 'draft' });
  eq(String(stale.code), 'SHIPMENT_STATUS_CHANGED',
    'D20 §D a stated expected_status that no longer matches refuses rather than cancelling something else');
  eq(w.counts(), before, 'D20a with zero writes');

  var odd = reservedShipment({ shipment: { status: 'stuck' } });
  var r = runCancel(odd, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' });
  eq(String(r.code), 'SHIPMENT_STATUS_NOT_CANCELLABLE',
    'D21 §D an unrecognised-but-not-dispatched status FAILS CLOSED rather than being assumed cancellable');
  eq(odd.reserved(), 800, 'D21a leaving the reservation alone');

  var missing = world();
  var r2 = runCancel(missing, { shipment_id: 'NOPE', actor: 'op' });
  eq(String(r2.code), 'SHIPMENT_NOT_FOUND', 'D22 §D.1 a missing shipment is refused by name');
  var noId = world();
  eq(String(runCancel(noId, { actor: 'op' }).code), 'MISSING_SHIPMENT_ID', 'D23 §D.1 and so is a missing id');

  // §D — the lock. A cancel that cannot serialize must refuse rather than race the reservation.
  var locked = reservedShipment();
  var lr = runCancel(locked, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, null, null, null, { lockAvailable: false });
  eq(String(lr.code), 'LOCK_UNAVAILABLE', 'D24 §D an unavailable lock refuses the cancel');
  eq(locked.mutated(), [], 'D24a writing nothing');
})();

(function () {
  // §D — a cancel must NEVER release another shipment's reservation. SHP-1 cancels while SHP-2 holds 200.
  var w = reservedShipment({
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 1000 }],
    movements: [
      { factory_stock_movement_id: 'M1', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
        movement_type: 'reservation_acquire', qty: 800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
        before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 },
      { factory_stock_movement_id: 'M2', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
        movement_type: 'reservation_acquire', qty: 200, related_entity_type: 'shipment', related_entity_id: 'SHP-2',
        before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 800, after_reserved_stock: 1000 }
    ]
  });
  var r = runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' });
  eq(Number(r.data.reservation_released), 800, 'D25 §D SHP-1 releases exactly its OWN 800');
  eq(w.reserved(), 200, 'D26 §D and SHP-2\'s 200 SURVIVES — release is owner-scoped');
  var ledger = prim.owner(w.sheets.factory_stock_movements, 'shipment', 'SHP-2');
  eq(ledger['WH-F||CO1100-R'], 200, 'D26a confirmed independently by SHP-2\'s own ledger');
})();

(function () {
  // §D — a pre-reservation shipment (created before FC-1A) cancels cleanly and releases nothing. This is the
  // migration case, and it must not be an error.
  var w = reservedShipment({
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 0 }],
    movements: []
  });
  var r = runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' });
  eq(r.success, true, 'D27 §D a shipment holding NO reservation still cancels');
  eq(Number(r.data.reservation_released), 0, 'D27a releasing nothing, and saying so');
  eq([w.current(), w.reserved()], [1000, 0], 'D27b with the balance untouched');
  eq(w.movements().length, 0, 'D27c and no movement row invented');
  ok(w.reserved() >= 0, 'D27d reserved is never negative');
})();

// ================================================================================================================
section('§D.10 / §M.7-9 — CANCEL, THEN RETRY: THE PLAN GETS A NEW DRAFT');
// ================================================================================================================
(function () {
  // The whole loop, end to end on the real handlers: approve -> reserve -> cancel -> release -> retry ->
  // a NEW draft with a NEW reservation. Before R1 the retry would have answered REUSED bound to the cancelled
  // shipment, so the plan could never get a live draft again.
  var w = world();
  var ra = runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  eq(ra.data.execution_commit, 'SHIPMENT_PRESENT', 'E1  approve creates the draft');
  eq(w.reserved(), 800, 'E1a and reserves 800');
  var firstId = String(w.shipments()[0].shipment_id);

  var rc = runCancel(w, { shipment_id: firstId, actor: 'op', reason: 'window moved' });
  eq(rc.data.outcome, 'CANCELLED', 'E2  §M.2 the draft is cancelled');
  eq([w.current(), w.reserved()], [1000, 0], 'E3  §M.2 current 1000, reserved 0 — the units are free again');
  eq(prim.balance(w.sheets.factory_stock, 'WH-F', 'CO1100-R').available, 1000,
    'E4  §M.2 available is back to the full 1000, which is what unblocks another plan');

  // §M.7 — the plan is approved with no live shipment, so the recovery state is derivable again.
  eq(String(w.plans()[0].status), 'approved', 'E5  §M.7 the plan is still approved');
  var spRecovery = (function () {
    var a = SPPAGE.indexOf('__SP_RECOVERY_PURE_START__'), b = SPPAGE.indexOf('__SP_RECOVERY_PURE_END__');
    var src = SPPAGE.slice(SPPAGE.indexOf(NL, a) + 1, SPPAGE.lastIndexOf(NL, b));
    return new Function('var OUT;' + src + NL + 'return spShipmentRecoveryState_;')();
  })();
  eq(spRecovery('approved', false, true, false).state, 'APPROVED_SHIPMENT_CREATION_PENDING',
    'E6  §M.7 and the page\'s REAL predicate puts it back in the recoverable state');
  eq(spRecovery('approved', false, true, false).canRetry, true, 'E6a with Retry available');

  // §M.8 — retry creates a NEW draft and a NEW reservation.
  var rr = runRetry(w, { shipping_plan_id: 'SP-1', actor: 'op' });
  eq(rr.success, true, 'E7  §M.8 the retry succeeds');
  eq(rr.data.outcome, 'CREATED', 'E7a answering CREATED, not REUSED — the cancelled draft is not an existing one');
  var newId = String(rr.data.shipment_id);
  ok(newId && newId !== firstId, 'E8  §M.8 and it is a DIFFERENT shipment: ' + newId + ' != ' + firstId);
  eq(w.shipments().length, 2, 'E8a both rows exist — the cancelled one is preserved');
  eq(w.reserved(), 800, 'E9  §M.8 the new draft reserves 800 again');
  eq(prim.owner(w.sheets.factory_stock_movements, 'shipment', firstId)['WH-F||CO1100-R'], 0,
    'E9a the CANCELLED shipment holds nothing');
  eq(prim.owner(w.sheets.factory_stock_movements, 'shipment', newId)['WH-F||CO1100-R'], 800,
    'E9b and the NEW shipment holds all 800 — the ledger attributes them correctly');

  // §M.9 — retry replay, no duplicate.
  var before = w.counts();
  var rr2 = runRetry(w, { shipping_plan_id: 'SP-1', actor: 'op' });
  eq(rr2.data.outcome, 'REUSED', 'E10 §M.9 a replayed retry answers REUSED');
  eq(w.counts(), before, 'E10a changing zero cells');
  eq(w.shipments().length, 2, 'E10b and creating no third shipment');
})();

// ================================================================================================================
section('§E — WHOLE-PLAN CANCELLATION: REPORTED, NOT INVENTED');
// ================================================================================================================
// §E asked what happens when an APPROVED plan with an active pre-dispatch draft is cancelled. Measured: that
// transition does not exist and cannot be reached. §E's own instruction for this case is to STOP the branch and
// report it rather than invent a plan lifecycle, so it is pinned here as a finding with the exact reason.
(function () {
  var c11 = code(G11);
  // The FIRST occurrence of `transition === 'cancel'` is the Combined-Plan guard, which lists submit,
  // approve AND cancel together — slicing from there swept the approve branch into the block and made the
  // finding read as false. The branch itself is the `else if` form.
  var cancelStart = c11.indexOf("else if (transition === 'cancel')");
  ok(cancelStart !== -1, 'F0  §E the plan cancel branch is locatable');
  var cancelBlock = c11.slice(cancelStart);
  var cancelEnd = cancelBlock.indexOf("setCell('cancelled_at'");
  ok(cancelEnd !== -1, 'F0a and its body is bounded');
  cancelBlock = cancelBlock.slice(0, cancelEnd);
  ok(/curStatus !== 'draft' && curStatus !== 'pending_approval'/.test(cancelBlock),
    'F1  §E plan cancel is gated to draft|pending_approval');
  ok(cancelBlock.indexOf("=== 'approved'") === -1,
    'F2  §E FINDING: an APPROVED plan CANNOT be cancelled at all, so "cancel an approved plan with an active ' +
    'draft" is unreachable — the branch is STOPPED and reported, not invented');
  // And the consequence worth stating: the reachable path to the same business outcome is per-shipment
  // cancellation, which R1 provides and which leaves the approval standing.
  ok(/handleCancelShipmentDraft_/.test(code(G12)),
    'F2a the reachable equivalent is per-shipment cancellation, which keeps the approval (D8) and frees the units (D3)');
  // No plan-lifecycle change was made. This is the assertion that would fail if a later round quietly widened it.
  ok(!/curStatus === 'approved'[\s\S]{0,200}setCell\('status', 'cancelled'\)/.test(c11),
    'F3  §E and NO approved-plan cancellation was added by this round');
})();

// ================================================================================================================
section('§F — THE SHIPMENT DRAFT UI');
// ================================================================================================================
(function () {
  var live = code(SHPAGE);
  ok(/function shCancelShipmentDraft/.test(live), 'G1  §F the page defines the cancel command');
  ok(/window\.shCancelShipmentDraft = shCancelShipmentDraft/.test(live), 'G1a and exports it for the card markup');
  ok(/KM\.DB\.cancelShipmentDraft\(/.test(live), 'G2  §F which calls the routed action');
  ok(/onclick="shCancelShipmentDraft/.test(SHPAGE), 'G3  §F and the card carries the button');

  // §F — the confirmation must state the two facts an operator cannot infer, and name the quantity.
  var fn = extractFn(SHPAGE, 'shCancelShipmentDraft');
  ok(/confirm\(/.test(fn), 'G4  §F explicit confirmation is required');
  ok(/will NOT be deducted/.test(fn), 'G5  §F it says current stock is NOT deducted');
  ok(/WILL be released/.test(fn), 'G6  §F and that the reserved quantity IS released');
  ok(/Quantity: ' \+ qty/.test(fn) && /Source warehouse/.test(fn), 'G7  §F naming the exact qty and source warehouse');
  ok(/A reason is required/.test(fn), 'G8  §F a reason is required');
  ok(/reason: reason/.test(fn), 'G8a and sent to the server');
  ok(/expected_status/.test(fn), 'G9  §F it states the status it saw, so a stale card cannot cancel blind');

  // §F.3 / §M.20 — one click, one cancellation.
  ok(/_shCancelInFlight\[shipmentId\]/.test(fn), 'G10 §M.20 an in-flight guard returns early on a second click');
  ok(/_shSetCancelBusy_/.test(fn), 'G10a and the button is disabled while it runs');
  ok(/b\.disabled = !!busy/.test(code(extractFn(SHPAGE, '_shSetCancelBusy_'))), 'G10b actually disabled, not just relabelled');

  // §F — offered ONLY pre-dispatch. The forbidden statuses must not reach the button.
  var cardFn = SHPAGE.slice(SHPAGE.indexOf("if (mode === 'draft') {"));
  cardFn = cardFn.slice(0, cardFn.indexOf('// F1-6B Part B'));
  ok(/status === 'draft'[\s\S]{0,400}cancelBtn/.test(cardFn), 'G11 §F Cancel is offered on a draft');
  ok(/status === 'ready_to_ship'[\s\S]{0,500}cancelBtn/.test(cardFn), 'G11a and on ready_to_ship');
  var afterCancelled = cardFn.slice(cardFn.indexOf("status === 'cancelled'"));
  ok(afterCancelled.indexOf('cancelBtn') === -1, 'G12 §F NOT on an already-cancelled shipment');
  ['shipped', 'in_transit', 'arrived', 'received', 'closed'].forEach(function (st, i) {
    ok(!new RegExp("status === '" + st + "'[\\s\\S]{0,300}cancelBtn").test(cardFn),
      'G13.' + (i + 1) + ' §F and never on ' + st);
  });

  // §F — success handling: authoritative readback, and no optimistic cancellation on failure.
  ok(/_shLoadAndRender\(\)/.test(fn), 'G14 §F success triggers an authoritative readback');
  ok(/no optimistic cancellation/.test(SHPAGE) || /Nothing was changed/.test(fn),
    'G15 §F and a typed failure retains the state on screen');
  ok(/err\.code/.test(fn), 'G15a surfacing the typed code, not just prose');

  // §F — THE CARD MUST STILL BE VISIBLE. Cancellation moves the row to `cancelled`, and Overview shows
  // `shipped` onward, so without this the card vanishes from both pages the instant it is cancelled and the
  // operator cannot tell a successful cancellation from a failed request.
  var draftSet = (SHPAGE.match(/var SH_DRAFT_STATUSES = \[([^\]]*)\]/) || [])[1] || '';
  ok(/'cancelled'/.test(draftSet), 'G16 §F `cancelled` is in the Shipment Draft status set, so the card stays visible');
  ok(/\['cancelled', 'Cancelled'\]/.test(SHPAGE), 'G16a with its own group heading');
  ok(/<option value="cancelled">Cancelled<\/option>/.test(SHPAGE), 'G16b and a status filter option');
})();

// ================================================================================================================
section('§G — ONE MOVEMENT VOCABULARY OWNER, AND WHAT EACH TYPE MOVES');
// ================================================================================================================
(function () {
  // §A / §N.12 — SEVEN, and the set is pinned so a later round cannot quietly revert it to five.
  eq(prim.TYPES.slice().sort(), ['inventory_import', 'manual_adjustment', 'po_receipt', 'reservation_acquire',
    'reservation_release', 'shipment_out', 'shipment_receipt'],
    'H1  §A the canonical vocabulary is SEVEN');
  var owners = GS_FILES.filter(function (f) { return /var FSTX_MOVEMENT_TYPES_ = \[/.test(GS_SRC[f]); });
  eq(owners, ['21_factory_inventory_handlers.gs'], 'H2  §G defined exactly ONCE, in the stock authority');
  ['factoryStockIsKnownMovementType_', 'factoryStockIsReservationMovement_', 'factoryStockIsCurrentMovement_',
   'factoryStockReconcileReservations_'].forEach(function (fn, i) {
    var o = GS_FILES.filter(function (f) { return new RegExp('function ' + fn + '\\(').test(GS_SRC[f]); });
    eq(o, ['21_factory_inventory_handlers.gs'], 'H2.' + (i + 1) + ' §G ' + fn + ' has ONE owner');
  });

  // §G.6 — THE AXIS EACH TYPE MOVES, which is the whole reason the predicates exist.
  eq([prim.isRes('reservation_acquire'), prim.isRes('reservation_release')], [true, true],
    'H3  §G.6 the two reservation types move the RESERVED axis');
  eq(prim.isCur('reservation_acquire'), false, 'H4  §G.3 and NOT the current axis — this is what stops a ' +
    'reservation being reported as physical stock movement');
  eq(prim.isCur('reservation_release'), false, 'H4a neither of them');
  ['inventory_import', 'manual_adjustment', 'po_receipt', 'shipment_out'].forEach(function (t, i) {
    eq([prim.isCur(t), prim.isRes(t)], [true, false], 'H5.' + (i + 1) + ' §G.6 ' + t + ' moves CURRENT only');
  });
  // shipment_out is the asymmetry: it releases a hold, but by its OWN before/after pair, never as a second row.
  eq(prim.isRes('shipment_out'), false,
    'H6  §G.5 shipment_out is NOT a reserved-axis row — it carries its release in its own before/after pair, ' +
    'so counting it as one would DOUBLE-COUNT every dispatched reservation');
  eq(prim.isKnown('reservation_acquire'), true, 'H7  §G.1 a reservation type is KNOWN to the vocabulary');
  eq(prim.isKnown('some_new_thing'), false, 'H7a and an unknown one is not silently accepted');

  // §G.1 — no reader drops an unknown row silently. The reconciliation REPORTS it.
  var rec = prim.reconcile(
    [{ warehouse_id: 'WH-F', sku: 'S1', fac_current_stock: 100, fac_reserved_stock: 0 }],
    [{ movement_type: 'a_type_from_the_future', qty: 50, warehouse_id: 'WH-F', sku: 'S1' }]);
  eq(rec.rows[0].unknown_type_rows, 1, 'H8  §G.1 an unknown movement type is REPORTED, never silently dropped');
  eq(rec.rows[0].derived_reserved, 0, 'H8a and never counted into a balance');

  // §G.2 — the diagnostics and reports include the reservation types.
  ok(RECON.indexOf('factoryStockReconcileReservations_') !== -1,
    'H9  §G.2 the reconciliation diagnostic calls the CANONICAL function, not a private copy');
  ok(!/acquire_total\s*=|derived\s*=\s*.*acquire/.test(code(RECON)),
    'H9a it contains no arithmetic of its own — a second opinion nobody could adjudicate');

  // §G.7 — replay detection uses movement_type AND owner identity. This is the bug FC-1A introduced and R1
  // must keep fixed: the dispatch guard treated ANY shipment-owned movement as a dispatch, so every reserved
  // shipment reported already_confirmed and nothing could ship at all.
  var guard = code(extractFn(G22, 'csdMovementExists_'));
  ok(/movement_type/.test(guard), 'H10 §G.7 the dispatch guard reads movement_type');
  ok(/=== CSD_MOV_TYPE_/.test(guard), 'H10a and matches shipment_out specifically');
  ok(/related_entity_id/.test(guard), 'H10b alongside owner identity');
  var ownerLedger = code(extractFn(G21, 'factoryStockOwnerReservedTx_'));
  ok(/FSTX_MOV_RESERVE_ACQUIRE_/.test(ownerLedger) && /FSTX_MOV_RESERVE_RELEASE_/.test(ownerLedger),
    'H11 §G.7 and the owner ledger counts ONLY the two reservation types');
  ok(/riC\]\s*\|\|\s*''\)\.trim\(\) !== ownerId/.test(ownerLedger), 'H11a scoped to one owner');

  // §A — anything still claiming the vocabulary is closed at FIVE is stale. Measured across the repository.
  var stale = [];
  var SELF = 'shipment-cancellation-and-movement-vocabulary-f1-7n-fc-1a-r1.test.js';
  ['assets/specs/active/apps-script', 'assets/tests', 'assets/tools/apps-script-diagnostics'].forEach(function (dir) {
    fs.readdirSync(path.join(ROOT, dir)).forEach(function (f) {
      if (!/\.(gs|js|md)$/.test(f) || f.indexOf('90_generated') === 0) return;
      if (f === SELF) return;   // this file HOLDS the search pattern; matching itself proves nothing
      var src = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
      if (/closed movement vocabulary|vocabulary is closed at five|closed at 5\b/i.test(src)) stale.push(dir + '/' + f);
    });
  });
  eq(stale, [], 'H12 §A nothing in the repository still claims the vocabulary is closed at five');
})();

// ================================================================================================================
section('§H — RESERVED-BALANCE RECONCILIATION');
// ================================================================================================================
(function () {
  // §M.13 — an EXACT match on a healthy world, including a dispatched shipment. The dispatched case is the one
  // that a naive implementation gets wrong.
  var rec = prim.reconcile(
    [{ warehouse_id: 'WH-F', sku: 'S1', fac_current_stock: 200, fac_reserved_stock: 300 }],
    [
      // SHP-A acquired 800 and dispatched it: the shipment_out row carries the reserved drop itself.
      { movement_type: 'reservation_acquire', qty: 800, warehouse_id: 'WH-F', sku: 'S1',
        related_entity_type: 'shipment', related_entity_id: 'SHP-A', before_reserved_stock: 0, after_reserved_stock: 800 },
      { movement_type: 'shipment_out', qty: -800, warehouse_id: 'WH-F', sku: 'S1',
        related_entity_type: 'shipment', related_entity_id: 'SHP-A', before_reserved_stock: 800, after_reserved_stock: 0 },
      // SHP-B still holds 300.
      { movement_type: 'reservation_acquire', qty: 300, warehouse_id: 'WH-F', sku: 'S1',
        related_entity_type: 'shipment', related_entity_id: 'SHP-B', before_reserved_stock: 0, after_reserved_stock: 300 },
      // A PO receipt and an adjustment move current only.
      { movement_type: 'po_receipt', qty: 200, warehouse_id: 'WH-F', sku: 'S1', before_reserved_stock: 300, after_reserved_stock: 300 },
      { movement_type: 'manual_adjustment', qty: -100, warehouse_id: 'WH-F', sku: 'S1', before_reserved_stock: 300, after_reserved_stock: 300 }
    ]);
  eq(rec.code, 'RECONCILED', 'I1  §M.13 a healthy world reconciles EXACTLY');
  eq(rec.ok, true, 'I1a with no mismatches');
  var r0 = rec.rows[0];
  eq([r0.acquire_total, r0.release_total, r0.dispatch_released], [1100, 0, 800],
    'I2  §H the three terms: acquired 1100, released 0, dispatched 800');
  eq([r0.stored_reserved, r0.derived_reserved, r0.difference], [300, 300, 0],
    'I2a §H derived = 1100 + 0 - 800 = 300 = stored');
  eq(r0.consumed_by_shipment_out, 800,
    'I3  §H.1 the dispatched 800 is counted EXACTLY ONCE — a dispatch releases its own hold on its own row ' +
    'and writes no separate reservation_release, so that drop IS the release record');
  eq(r0.outstanding_by_owner, { 'shipment:SHP-B': 300 },
    'I4  §H outstanding is attributed to the owner still holding it, and SHP-A (fully dispatched) nets to zero');
  eq(r0.derived_available, -100, 'I5  §H available is derived from CURRENT minus DERIVED reserved (200 - 300)');

  // §M.14 — a DELIBERATE mismatch must be detected and typed.
  var bad = prim.reconcile(
    [{ warehouse_id: 'WH-F', sku: 'S1', fac_current_stock: 1000, fac_reserved_stock: 500 }],
    [{ movement_type: 'reservation_acquire', qty: 800, warehouse_id: 'WH-F', sku: 'S1',
       related_entity_type: 'shipment', related_entity_id: 'SHP-A', before_reserved_stock: 0, after_reserved_stock: 800 }]);
  eq(bad.code, 'FACTORY_RESERVATION_LEDGER_MISMATCH', 'I6  §H.3 a stored/derived disagreement is TYPED');
  eq(bad.ok, false, 'I6a and not ok');
  eq([bad.mismatches.length, bad.mismatches[0].stored_reserved, bad.mismatches[0].derived_reserved,
      bad.mismatches[0].difference], [1, 500, 800, -300],
    'I7  §H.3 reporting stored, derived AND the difference — never rounded into agreement');

  // A ledger entry against a warehouse/SKU with no stock row at all: reserved units against stock that does
  // not exist. Reported rather than ignored.
  var orphan = prim.reconcile([], [{ movement_type: 'reservation_acquire', qty: 100, warehouse_id: 'WH-X',
    sku: 'S9', related_entity_type: 'shipment', related_entity_id: 'SHP-Z' }]);
  eq(orphan.code, 'FACTORY_RESERVATION_LEDGER_MISMATCH', 'I8  §H a reservation against a NON-EXISTENT stock row is a mismatch');
  eq(orphan.mismatches[0].has_stock_row, false, 'I8a and says the row is missing');

  // §H.2 — a fully released reservation nets to zero and is not reported as an outstanding holder.
  var released = prim.reconcile(
    [{ warehouse_id: 'WH-F', sku: 'S1', fac_current_stock: 1000, fac_reserved_stock: 0 }],
    [{ movement_type: 'reservation_acquire', qty: 500, warehouse_id: 'WH-F', sku: 'S1',
       related_entity_type: 'shipment', related_entity_id: 'SHP-C', before_reserved_stock: 0, after_reserved_stock: 500 },
     { movement_type: 'reservation_release', qty: -500, warehouse_id: 'WH-F', sku: 'S1',
       related_entity_type: 'shipment', related_entity_id: 'SHP-C', before_reserved_stock: 500, after_reserved_stock: 0 }]);
  eq(released.code, 'RECONCILED', 'I9  §H.2 a cancelled-and-released reservation reconciles at zero');
  eq(released.rows[0].outstanding_by_owner, {}, 'I9a and its owner is NOT listed as holding anything');

  // §H.4 — it never auto-repairs. There is nothing in it that could.
  var recCode = code(extractFn(G21, 'factoryStockReconcileReservations_'));
  ok(!/setValue|appendRow|deleteRow/.test(recCode), 'I10 §H.4 the reconciliation cannot write — it is pure');
  ok(!/repair|backfill|correct/i.test(recCode), 'I10a and contains no repair path');

  // §H — and it EXECUTES against the real cancel path, so the two agree on a world this suite produced.
  var w = reservedShipment();
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' });
  var live = prim.reconcile(w.stock(), w.movements());
  eq(live.code, 'RECONCILED', 'I11 §H after a real cancellation the ledger and the balance AGREE');
  eq([live.rows[0].stored_reserved, live.rows[0].derived_reserved], [0, 0], 'I11a both at zero');

  var w2 = world();
  runApprove(w2, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  var live2 = prim.reconcile(w2.stock(), w2.movements());
  eq([live2.code, live2.rows[0].stored_reserved, live2.rows[0].derived_reserved], ['RECONCILED', 800, 800],
    'I12 §H and after a real acquisition they agree at 800');
})();

(function () {
  // §H.5/§H.6/§H.7 — the bounded diagnostic.
  var body = code(RECON).replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  [['setValue', 1], ['appendRow', 2], ['deleteRow', 3], ['setValues', 4], ['insertSheet', 5],
   ['getScriptLock', 6], ['PropertiesService', 7], ['UrlFetchApp', 8], ['MailApp', 9], ['DriveApp', 10],
   ['clearContent', 11]].forEach(function (p) {
    ok(body.indexOf(p[0]) === -1, 'J' + p[1] + '   §H.7 the diagnostic never names ' + p[0] + ' in code');
  });
  ok(/function readOnlyR1_\(ss, name\)/.test(RECON), 'J12 §H.7 every sheet goes through a read-only facade');
  ok(!/return sh;|sheet: sh\b/.test(code(extractFn(RECON, 'readOnlyR1_'))),
    'J12a which never hands back a write-capable Sheet handle');
  ok(/DB_WRITES=0/.test(RECON) && /REPAIRS=0/.test(RECON) && /RESERVATIONS_MODIFIED=0/.test(RECON),
    'J13 §H.7 and it declares its own zero-write result');
  ok(/repairs: 0/.test(RECON) && !/repair/i.test(body.replace(/repairs:\s*0/g, '')),
    'J13a with no repair path in its code');

  // §H.6 — BOUNDED. Every list goes through the cap, and the cap reports the TRUE total.
  var cap = Number((RECON.match(/var FC1AR1_MAX_ROWS_ = (\d+);/) || [])[1]);
  ok(cap > 0, 'J14 §H.6 there is a numeric cap (' + cap + ')');
  var capFn = new Function('var FC1AR1_MAX_ROWS_ = ' + cap + ';' + NL + extractFn(RECON, 'fc1ar1Cap_') + NL + 'return fc1ar1Cap_;')();
  var many = [];
  for (var i = 0; i < 5000; i++) many.push('WH-F|CO1100-R|cur=1000|stored=800|derived=800|diff=0|avail=200|dispatched=0');
  var out = capFn(many);
  eq([out.total, out.shown, out.truncated], [5000, cap, true],
    'J15 §H.6 a 5000-row list is capped at ' + cap + ' and still reports its TRUE total');
  var listCount = (code(RECON).match(/fc1ar1Cap_\(/g) || []).length;
  ok(listCount >= 4, 'J16 §H.6 every list (' + listCount + ') goes through the cap');
  var fake = [];
  for (var k = 0; k < listCount; k++) fake.push(capFn(many));
  var worst = JSON.stringify({ report: 'FC-1A-R1_RESERVATION_RECONCILIATION', totals: {}, lists: fake });
  ok(worst.length < 50000, 'J17 §H.6 and the WORST-CASE whole report is ' + worst.length +
    ' bytes — under the Apps Script log limit');
  eq((RECON.match(/^function TEMP_[A-Z0-9_]+\(/gm) || []).length, 2,
    'J18 §H.5 ONE main entry point plus ONE explicitly-single-key detail helper');
  ok(/RECONCILIATION_OWNER_NOT_DEPLOYED/.test(RECON),
    'J19 §H and a deployment missing the canonical function is NAMED rather than silently substituted');
})();

// ================================================================================================================
section('§I — SOURCE WAREHOUSE MOVE, PRESERVED; QTY STILL IMMUTABLE');
// ================================================================================================================
(function () {
  // §M.11 — the FC-1A behaviour must survive R1 unchanged.
  var w = reservedShipment({
    stock: [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 },
      { factory_stock_id: 'FS-2', warehouse_id: 'WH-G', sku: 'CO1100-R', fac_current_stock: 900, fac_reserved_stock: 0 }
    ]
  });
  var r = runUpdateShipment(w, { shipment_id: 'SHP-1', source_warehouse_id: 'WH-G', actor: 'op' });
  eq(r.success, true, 'K1  §I.1 the source change is accepted');
  eq([w.current('WH-F'), w.reserved('WH-F')], [1000, 0], 'K2  §I.2 WH-F releases 800; current untouched');
  eq([w.current('WH-G'), w.reserved('WH-G')], [900, 800], 'K3  §I.3 WH-G acquires 800; current untouched');
  eq(String(w.shipments()[0].source_warehouse_id), 'WH-G', 'K4  §I.4 and the draft records the new source');
  var types = w.movements().map(function (m) { return String(m.movement_type); });
  eq(types, ['reservation_acquire', 'reservation_release', 'reservation_acquire'],
    'K5  §I.5 recorded as a release and an acquire — full lineage at BOTH warehouses');
  eq(prim.reconcile(w.stock(), w.movements()).code, 'RECONCILED', 'K5a and the ledger reconciles afterwards');

  // §I.6 — a refusal leaves the old source AND its reservation unchanged.
  var w2 = reservedShipment({
    stock: [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 800 },
      { factory_stock_id: 'FS-2', warehouse_id: 'WH-G', sku: 'CO1100-R', fac_current_stock: 100, fac_reserved_stock: 0 }
    ]
  });
  var before = w2.counts();
  var r2 = runUpdateShipment(w2, { shipment_id: 'SHP-1', source_warehouse_id: 'WH-G', actor: 'op' });
  eq(String(r2.code), 'INSUFFICIENT_FACTORY_STOCK_AT_NEW_SOURCE', 'K6  §I.6 an unaffordable move is REFUSED');
  eq(w2.counts(), before, 'K6a with nothing written — the reservation is not half-moved');
  eq([w2.reserved('WH-F'), w2.reserved('WH-G')], [800, 0], 'K6b and the original hold is exactly where it was');
  eq(String(w2.shipments()[0].source_warehouse_id), 'WH-F', 'K6c with the source unchanged');

  // §I.7 — a destination / method / display-only change must NOT move the source reservation.
  var w3 = reservedShipment();
  var b3 = w3.counts();
  var r3 = runUpdateShipment(w3, { shipment_id: 'SHP-1', destination_warehouse_id: 'WH-US-OTHER',
    shipping_method: 'air', note: 'changed my mind', actor: 'op' });
  eq(r3.success, true, 'K7  §I.7 a destination + method + note change succeeds');
  eq([w3.current(), w3.reserved()], [1000, 800], 'K8  §I.7 and the source reservation is NOT touched');
  eq(w3.counts().factory_stock, b3.factory_stock, 'K8a not one factory_stock cell was written');
  eq(w3.counts().factory_stock_movements, b3.factory_stock_movements, 'K8b and no movement row was appended');

  // §I — SHIPMENT QTY REMAINS IMMUTABLE. Pinned, because the day it becomes editable the reservation silently
  // stops matching the shipment it belongs to.
  var editable = (code(G12).match(/var SHIPMENT_EDITABLE_FIELDS_ = \[([\s\S]*?)\]/) || [])[1] || '';
  ok(editable.indexOf('shipment_qty') === -1, 'K9  §I shipment_qty is NOT in the editable field set');
  ok(editable.indexOf('source_warehouse_id') !== -1, 'K9a while source_warehouse_id IS, which is why K1-K6 exist');
  var w4 = reservedShipment();
  var b4 = w4.counts();
  runUpdateShipment(w4, { shipment_id: 'SHP-1', shipment_qty: 400, actor: 'op' });
  eq(Number(w4.shipmentLines()[0].shipment_qty), 800, 'K10 §I a shipment_qty in the body is IGNORED');
  eq(w4.reserved(), 800, 'K10a and the reservation is unchanged');
})();

// ================================================================================================================
section('§J — DISPATCH INTEGRATION, RE-EXECUTED AFTER THE CANCELLATION WORK');
// ================================================================================================================
(function () {
  // §J — the FC-1A dispatch contract must be byte-for-byte unaffected by R1.
  var w = reservedShipment();
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  eq(r.success, true, 'L1  §J.1 a reserved shipment dispatches');
  eq([w.current(), w.reserved()], [200, 0], 'L2  §J current 200, reserved 0');
  var outs = w.movements().filter(function (m) { return String(m.movement_type) === 'shipment_out'; });
  eq(outs.length, 1, 'L3  §J ONE canonical shipment_out movement');
  eq(Number(outs[0].qty), -800, 'L3a signed negative');
  eq([Number(outs[0].before_reserved_stock), Number(outs[0].after_reserved_stock)], [800, 0],
    'L4  §J carrying its own reserved release in its own before/after pair');
  var rels = w.movements().filter(function (m) { return String(m.movement_type) === 'reservation_release'; });
  eq(rels.length, 0,
    'L5  §J and NO additional standalone reservation_release — the ledger requires exactly one row for this');
  eq(String(objsOf(w.sheets.shipments)[0].status), 'shipped', 'L6  §J the shipment ends at shipped');
  eq(w.sheets.shipment_routes.appends, 2, 'L6a with its route snapshot');
  eq(w.sheets.shipment_events.appends, 1, 'L6b and exactly one initial event');
  eq(prim.reconcile(w.stock(), w.movements()).code, 'RECONCILED', 'L7  §J and the ledger reconciles');

  var before = w.counts();
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  eq(w.counts(), before, 'L8  §J a replayed dispatch changes ZERO cells');
})();

(function () {
  // §J / §M.6 — DISPATCH AFTER CANCELLATION IS REFUSED with zero writes. The shipment is cancelled and holds
  // nothing; dispatching it would deduct stock for a shipment nobody approved shipping.
  var w = reservedShipment();
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' });
  var before = w.counts();
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  ok(r.success === false || r.already_confirmed === true,
    'L9  §M.6 dispatching a CANCELLED shipment does not proceed to a deduction');
  eq(w.current(), 1000, 'L10 §M.6 current stock is UNCHANGED — no deduction happened');
  eq(w.movements().filter(function (m) { return String(m.movement_type) === 'shipment_out'; }).length, 0,
    'L10a and no shipment_out row was written');
  eq(w.counts(), before, 'L11 §M.6 with zero writes anywhere');
  eq(String(w.shipments()[0].status), 'cancelled', 'L11a and the shipment stays cancelled');
})();

// ================================================================================================================
section('§K — PO OVER-RECEIPT: AN EXPLICIT REFUSAL, NOT A SILENT CLAMP');
// ================================================================================================================
var POL_H = ['purchase_order_line_id', 'purchase_order_id', 'sku', 'ordered_qty', 'completed_qty', 'shipped_qty',
  'remaining_qty', 'supplier_warehouse_id', 'updated_at'];
var PO_H = ['purchase_order_id', 'po_no', 'order_status', 'completed_by', 'completed_at', 'updated_by', 'updated_at'];
var WH_H = ['warehouse_id', 'warehouse_code', 'is_active', 'is_factory_warehouse'];
function receiptWorld(opts) {
  opts = opts || {};
  var sheets = {
    purchase_orders: new MemSheet('purchase_orders', gridOf(PO_H, [{ purchase_order_id: 'PO-1', po_no: 'PO0001', order_status: 'issued' }])),
    purchase_order_lines: new MemSheet('purchase_order_lines', gridOf(POL_H, opts.lines || [
      { purchase_order_line_id: 'POL-1', purchase_order_id: 'PO-1', sku: 'CO1100-R', ordered_qty: 500,
        completed_qty: 0, shipped_qty: 0, remaining_qty: 0, supplier_warehouse_id: 'WH-F' }
    ])),
    warehouses: new MemSheet('warehouses', gridOf(WH_H, [{ warehouse_id: 'WH-F', warehouse_code: 'FAC', is_active: 'TRUE', is_factory_warehouse: 'TRUE' }])),
    factory_stock: new MemSheet('factory_stock', gridOf(FS_H, opts.stock || [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: opts.reserved || 0 }
    ])),
    factory_stock_movements: new MemSheet('factory_stock_movements', gridOf(MOV_H, opts.movements || []))
  };
  return { sheets: sheets,
    ss: { getId: function () { return 'DBID-R1'; }, getSheetByName: function (n) { return sheets[n] || null; },
      insertSheet: function (n) { sheets[n] = new MemSheet(n, [[]]); return sheets[n]; } },
    counts: function () { var c = {}; Object.keys(sheets).forEach(function (n) { c[n] = sheets[n].mutations(); }); return c; },
    mutated: function () { return Object.keys(sheets).filter(function (n) { return sheets[n].mutations() > 0; }).sort(); },
    stock: function () { return objsOf(sheets.factory_stock); },
    movements: function () { return objsOf(sheets.factory_stock_movements); },
    lines: function () { return objsOf(sheets.purchase_order_lines); } };
}
function runReceipt(w, body, g13, g21) {
  return buildRunner([
    extractFn(g13 || G13, 'poRcvTruthy_'),
    extractFn(g13 || G13, 'poReceiptEvaluateLine_'),
    extractFn(g13 || G13, 'handleReceivePurchaseOrderLines_'),
    extractFn(g13 || G13, 'procurementTimestamp_'),
    core21(g21)
  ], 'handleReceivePurchaseOrderLines_')(w, body);
}

(function () {
  // §K.1 — a normal full receipt.
  var w = receiptWorld();
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K1',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 500 }] });
  eq(r.success, true, 'M1  §K.1 a receipt of the full 500 succeeds');
  eq(Number(w.stock()[0].fac_current_stock), 1500, 'M1a current +500');
  var po = w.movements().filter(function (m) { return String(m.movement_type) === 'po_receipt'; });
  eq([po.length, Number(po[0].qty)], [1, 500], 'M1b with ONE po_receipt movement of 500');
  eq(Number(w.stock()[0].fac_reserved_stock), 0, 'M1c and reserved is untouched');

  // §K.2 — replay.
  var before = w.counts();
  runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K1',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 500 }] });
  eq(w.counts(), before, 'M2  §K.2 a replay with the same key writes ZERO cells');
})();

(function () {
  // §K.3 / §M.17 — THE CORRECTION. Remaining 500, attempt 900.
  var w = receiptWorld();
  var before = w.counts();
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K3',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 900 }] });
  eq(r.success, false, 'M3  §K.3 an over-receipt is now REFUSED, not silently clamped');
  eq(String(r.code), 'PO_RECEIPT_EXCEEDS_REMAINING_QTY', 'M3a with the typed code §A named');
  eq([r.data.attempted_qty, r.data.remaining_qty, r.data.excess_qty], [900, 500, 400],
    'M4  §K.3 showing attempted 900, remaining 500 and excess 400 — the three numbers a clamp never showed');
  eq(r.data.zero_write, true, 'M4a and declaring itself a zero-write refusal');
  eq(Number(w.stock()[0].fac_current_stock), 1000, 'M5  §K.3 factory stock is UNCHANGED');
  eq(w.movements().length, 0, 'M5a no movement row');
  eq(Number(w.lines()[0].completed_qty), 0, 'M5b no PO line change');
  eq(w.counts(), before, 'M5c and nothing anywhere was written');
  ok(/Nothing was received/.test(String(r.error)), 'M6  §K.3 and the message says so in words too');
})();

(function () {
  // §K.4/§K.5 — partial, then the remainder, then nothing left.
  var w = receiptWorld();
  runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'P1',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 300 }] });
  var l = w.lines()[0];
  eq([Number(l.completed_qty), Number(l.shipped_qty), Number(l.remaining_qty)], [300, 0, 300],
    'M7  §K.4 a partial receipt of 300: remaining_qty = MAX(0, 300-0) = 300 (received and NOT yet shipped)');
  eq(Number(w.stock()[0].fac_current_stock), 1300, 'M7a with current +300');

  // §K.5 — a subsequent receipt WITHIN the remainder succeeds once.
  var r2 = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'P2',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] });
  eq(r2.success, true, 'M8  §K.5 the remaining 200 is received');
  eq([Number(w.lines()[0].completed_qty), Number(w.stock()[0].fac_current_stock)], [500, 1500],
    'M8a completed 500, current 1500');

  // §K.6 — and now nothing can exceed the canonical remaining, however it is asked.
  var before = w.counts();
  var r3 = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'P3',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 100 }] });
  ok(r3.success === false || Number(w.lines()[0].completed_qty) === 500,
    'M9  §K.6 a further receipt on a FULLY received line cannot exceed the canonical remaining');
  eq(w.counts(), before, 'M9a writing nothing');
  ok(Number(w.lines()[0].completed_qty) <= Number(w.lines()[0].ordered_qty),
    'M10 §K.6 completed_qty can NEVER exceed ordered_qty');
})();

(function () {
  // §K.7 — a failure AFTER the stock rose unwinds stock, movement AND the PO line together.
  var w = receiptWorld();
  var g21 = mutateFn(G21, 'factoryStockApplyDeltaTx_',
    "  journal.push({ kind: 'row', sheet: movSheet, row: movSheet.getLastRow() });",
    "  journal.push({ kind: 'row', sheet: movSheet, row: movSheet.getLastRow() });\n  throw new Error('INJECTED_POST_MOVEMENT_FAILURE');");
  runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'F1',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] }, null, g21);
  eq(Number(w.stock()[0].fac_current_stock), 1000, 'M11 §K.7 the balance came back');
  eq(w.movements().length, 0, 'M11a the movement row is gone');
  eq(Number(w.lines()[0].completed_qty), 0, 'M11b and completed_qty never rose');

  // §K — the frozen remaining_qty formula is unchanged by this round.
  ok(/newRemaining: Math\.max\(0, newCompleted - shipped\)/.test(code(G13)),
    'M12 §K remaining_qty is still MAX(0, completed - shipped) — the frozen meaning, unchanged');
  // And no tolerance/override was invented.
  ok(!/tolerance|over_receipt_allow|allow_over/i.test(code(extractFn(G13, 'poReceiptEvaluateLine_'))),
    'M13 §A no over-receipt tolerance or override was invented — it stays an explicit future decision');
})();

// ================================================================================================================
section('§L — CONTRACT VERSIONS AND REACHABILITY');
// ================================================================================================================
(function () {
  // §L — the action-contract version MUST move, because a router ACTION was added. This is the raise that
  // protects stock rather than a read: a deployment at 10 acquires reservations and cannot release them.
  eq(Number((G63.match(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]), 11,
    'N1  §L SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ 10 -> 11 (a router ACTION was added)');
  eq(Number((DBAPI.match(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+);/) || [])[1]), 11,
    'N2  §L and the frontend raises its pinned minimum to match, in the same commit');
  eq(Number((G63.match(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = (\d+);/) || [])[1]), 12,
    'N3  §L SYS_REQUIRED_ACTION_LIST_VERSION_ 11 -> 12 (the registry gained an entry)');
  eq(Number((G63.match(/var SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+);/) || [])[1]), 1,
    'N4  §L the TRANSPORT contract does NOT move — the envelope shape is unchanged');

  // §L — the registry entry and the reachable chain.
  ok(/\{ action: 'cancelShipmentDraft', handler: 'handleCancelShipmentDraft_'/.test(G63),
    'N5  §L cancelShipmentDraft is in the required-action registry');
  ok(/'cancelShipmentDraft'/.test((DBAPI.match(/var KM_REQUIRED_DEPLOYED_ACTIONS_ = \[([\s\S]*?)\];/) || [])[1] || ''),
    'N5a and in the caller probe');
  var shdSet = (DBAPI.match(/'shipment-draft':\s*\[([\s\S]*?)\]/) || [])[1] || '';
  ok(/'cancelShipmentDraft'/.test(shdSet), 'N6  §L and in the shipment-draft page-specific required set');

  // THE FULL CHAIN: frontend -> adapter -> router -> handler -> shared transaction.
  ok(/onclick="shCancelShipmentDraft/.test(SHPAGE), 'N7  §L chain 1/5 the page renders a caller');
  ok(/window\.KM\.DB\.cancelShipmentDraft = function\(payload\) \{ return _kmWeeklyCommand_\('cancelShipmentDraft', payload\); \};/.test(DBAPI),
    'N7a §L chain 2/5 the adapter exists, on the command runner so typed codes survive');
  ok(/action === 'cancelShipmentDraft'/.test(code(G01)), 'N7b §L chain 3/5 the router dispatches it');
  ok(/function handleCancelShipmentDraft_/.test(code(G12)), 'N7c §L chain 4/5 the handler exists');
  ok(/factoryStockReleaseReservationTx_\(/.test(code(extractFn(G12, 'handleCancelShipmentDraft_'))),
    'N7d §L chain 5/5 and it reaches the SHARED transaction, never a balance cell of its own');
  ok(!/getRange\([^)]*(curCol|resCol)[^)]*\)\s*\.setValue/.test(code(extractFn(G12, 'handleCancelShipmentDraft_'))),
    'N8  §L the cancel handler writes NO factory_stock balance cell directly');

  // §L — the owner build stamps for every file this round changed behaviourally.
  [['01_router.gs', 'RTR_BUILD_VERSION_'], ['12_shipment_handlers.gs', 'SHIPMENT_BUILD_VERSION_'],
   ['13_procurement_handlers.gs', 'PROC_BUILD_VERSION_'], ['21_factory_inventory_handlers.gs', 'FSTX_BUILD_VERSION_']
  ].forEach(function (p, i) {
    // RESTATED (F1-7N-FC-1B-E3-R4-A2-R1-R5): both halves pinned the literal FC-1A-R1. R5 found 01_router's
    // stamp had never been rotated when the file last changed (R2) and corrected it, so a pinned literal now
    // reports a correct deployment as wrong. FC-1A-R1's claim is a FLOOR — each of these owners carries this
    // round's change or something after it — plus the invariant that matters in every round: the manifest
    // expects EXACTLY what the file declares. A half-synced owner is still named.
    var _declared = (code(GS_SRC[p[0]]).match(new RegExp('var ' + p[1] + " = '([^']+)'")) || [])[1];
    ok(require('./_release-order.js').stampAtOrAfter(_declared, 'F1-7N-FC-1A-R1'),
      'N9.' + (i + 1) + ' §L ' + p[0] + ' declares a stamp at or after FC-1A-R1');
    ok(new RegExp("file: '" + p[0].replace('.', '\.') + "', symbol: '" + p[1] + "', expected: '" + _declared + "'").test(G63),
      'N9.' + (i + 1) + 'a and the manifest expects EXACTLY what it declares');
  });
  ['handleCancelShipmentDraft_', 'FSTX_MOVEMENT_TYPES_', 'PROC_BUILD_VERSION_'].forEach(function (sym, i) {
    ok(DBAPI.indexOf("'" + sym + "'") !== -1, 'N10.' + (i + 1) + ' §L ' + sym + ' is probed as an owner symbol');
  });

  // §L — the frontend fails CLOSED on a mismatch. The gate is the shared page-scoped verdict.
  ok(/checkPageDeploymentContract/.test(DBAPI), 'N11 §L the page-scoped verdict helper exists');
  ok(/'shipment-draft':/.test(DBAPI) && /'shipment-overview':/.test(DBAPI),
    'N11a and both shipment pages have a required-action set');
})();

// ================================================================================================================
section('§M — THE REMAINING SIMULATIONS');
// ================================================================================================================
(function () {
  // §M.1 — acquire, stated once more against the real chain so the whole lifecycle is in one suite.
  var w = world();
  runApprove(w, { shipping_plan_id: 'SP-1', transition: 'approve', actor: 'op' });
  eq([w.current(), w.reserved()], [1000, 800], 'O1  §M.1 Shipment Draft creation acquires the reservation');

  // §M.12 — the two-site collision, with the CANCELLATION path as the resolution.
  var two = world({
    plans: [
      { shipping_plan_id: 'SP-A', status: 'pending_approval', source_warehouse_id: 'WH-F', company: 'Site A', country: 'US', marketplace: 'Amazon' },
      { shipping_plan_id: 'SP-B', status: 'pending_approval', source_warehouse_id: 'WH-F', company: 'Site B', country: 'CA', marketplace: 'Amazon' }
    ],
    planLines: [
      { shipping_plan_line_id: 'SPL-A', shipping_plan_id: 'SP-A', sku: 'CO1100-R', approved_qty: 800, plan_carton_qty: 40, units_per_carton: 20 },
      { shipping_plan_line_id: 'SPL-B', shipping_plan_id: 'SP-B', sku: 'CO1100-R', approved_qty: 800, plan_carton_qty: 40, units_per_carton: 20 }
    ]
  });
  runApprove(two, { shipping_plan_id: 'SP-A', transition: 'approve', actor: 'siteA' });
  eq(two.reserved(), 800, 'O2  §M.12 Site A holds 800');
  var rb = runApprove(two, { shipping_plan_id: 'SP-B', transition: 'approve', actor: 'siteB' });
  eq(rb.data.execution_commit, 'APPROVED_SHIPMENT_CREATION_PENDING',
    'O3  §M.12 Site B is refused at the Shipment Draft, and its approval is still committed');
  eq(String(rb.data.recovery.cause), 'INSUFFICIENT_FACTORY_STOCK', 'O3a typed');

  // R1's contribution: Site A can now GIVE THE UNITS BACK, and Site B's retry then succeeds. Before this
  // round there was no routed way to reach this state at all.
  var aId = String(two.shipments()[0].shipment_id);
  runCancel(two, { shipment_id: aId, actor: 'siteA', reason: 'Site B needs them first' });
  eq(two.reserved(), 0, 'O4  §M.12 Site A cancels and the 800 are released');
  eq(prim.balance(two.sheets.factory_stock, 'WH-F', 'CO1100-R').available, 1000, 'O4a available back to 1000');
  var rbr = runRetry(two, { shipping_plan_id: 'SP-B', actor: 'siteB' });
  eq(rbr.data.outcome, 'CREATED', 'O5  §M.12 and Site B\'s Retry now SUCCEEDS — the release unblocked it');
  eq(two.reserved(), 800, 'O5a with the 800 now held by Site B');
  eq(prim.reconcile(two.stock(), two.movements()).code, 'RECONCILED', 'O5b and the ledger reconciles throughout');
})();

// ================================================================================================================
section('§N — MUTATIONS. Each is applied to shipped source and must be caught.');
// ================================================================================================================
mut('N1  cancellation does NOT release the reservation', function () {
  var g12 = mutateFn(G12, 'handleCancelShipmentDraft_',
    "    if (stockSheet && movSheet) {", "    if (false) {");
  var w = reservedShipment();
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, g12);
  return String(w.shipments()[0].status) === 'cancelled' && w.reserved() === 800;
});
mut('N2  cancellation DEDUCTS current stock', function () {
  var g12 = mutateFn(G12, 'handleCancelShipmentDraft_',
    "        var rel = factoryStockReleaseReservationTx_({",
    "        factoryStockApplyDeltaTx_({ stockSheet: stockSheet, movSheet: movSheet, warehouseId: parts[0], sku: parts[1], deltaQty: -qty, reservedDelta: -qty, journal: journal, now: now0, movementType: 'manual_adjustment', relatedEntityType: 'shipment', relatedEntityId: shipmentId, createdBy: actor });\n        var rel = { applied: true, released: qty, reason: 'RELEASED' } || factoryStockReleaseReservationTx_({");
  var w = reservedShipment();
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, g12);
  return w.current() !== 1000;
});
mut('N3  cancellation releases ANOTHER shipment\'s reservation', function () {
  var g21 = mutateFn(G21, 'factoryStockOwnerReservedTx_',
    "    if (String(data[r][riC] || '').trim() !== ownerId) continue;", "    // owner scoping removed");
  var w = reservedShipment({
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 1000 }],
    movements: [
      { factory_stock_movement_id: 'M1', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
        movement_type: 'reservation_acquire', qty: 800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
        before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 800 },
      { factory_stock_movement_id: 'M2', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
        movement_type: 'reservation_acquire', qty: 200, related_entity_type: 'shipment', related_entity_id: 'SHP-2',
        before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 800, after_reserved_stock: 1000 }
    ]
  });
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, null, g21);
  return w.reserved() === 0;      // truth is 200: SHP-2's hold must survive
});
mut('N4  cancellation AFTER dispatch succeeds', function () {
  var g12 = mutateFn(G12, 'handleCancelShipmentDraft_',
    "  if (SHIPMENT_DISPATCHED_STATUSES_.indexOf(curStatus) !== -1) {", "  if (false) {");
  g12 = mutateFn(g12, 'handleCancelShipmentDraft_',
    "  if (hasStockMovement || hasRoutes || hasEvents) {", "  if (false) {");
  g12 = mutateFn(g12, 'handleCancelShipmentDraft_',
    "  if (SHIPMENT_PRE_DISPATCH_STATUSES_.indexOf(curStatus) === -1) {", "  if (false) {");
  var w = reservedShipment({ shipment: { status: 'shipped' },
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 200, fac_reserved_stock: 0 }],
    movements: [{ factory_stock_movement_id: 'M1', movement_date: '2026-09-02', sku: 'CO1100-R', warehouse_id: 'WH-F',
      movement_type: 'shipment_out', qty: -800, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
      before_current_stock: 1000, after_current_stock: 200, before_reserved_stock: 800, after_reserved_stock: 0 }] });
  var r = runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, g12);
  return r.success === true && String(w.shipments()[0].status) === 'cancelled';
});
mut('N5  a replayed cancellation releases TWICE (all THREE layers removed)', function () {
  // THREE INDEPENDENT LAYERS stop a replay from releasing twice, and it took removing all three to prove any
  // of them does anything. That is worth recording rather than working around:
  //   1 the `already cancelled` idempotency check returns REUSED before every guard;
  //   2 the fail-closed status gate refuses `cancelled`, which is not in SHIPMENT_PRE_DISPATCH_STATUSES_;
  //   3 THE SUBSTANTIVE ONE — the owner ledger. After the first release the owner holds 0, so
  //     `give = min(want, held)` is 0 and a second release is arithmetically a no-op even with 1 and 2 gone.
  // Layer 3 is the one that would survive a refactor of the status vocabulary, so the mutant has to defeat it
  // by releasing the REQUESTED quantity instead of the HELD quantity.
  var g12 = mutateFn(G12, 'handleCancelShipmentDraft_',
    "  if (curStatus === SHIPMENT_CANCELLED_STATUS_) {", "  if (false) {");
  g12 = mutateFn(g12, 'handleCancelShipmentDraft_',
    "  if (SHIPMENT_PRE_DISPATCH_STATUSES_.indexOf(curStatus) === -1) {", "  if (false) {");
  var g21 = mutateFn(G21, 'factoryStockReleaseReservationTx_',
    "  if (held <= 0) return { applied: false, reason: 'NO_RESERVATION', released: 0, alreadyHeld: 0, movementId: '' };",
    "  // ledger idempotency removed");
  g21 = mutateFn(g21, 'factoryStockReleaseReservationTx_',
    "  var give = Math.min(want, held);", "  var give = want;");

  var w = reservedShipment();
  var first = runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, g12, g21);
  var afterFirst = w.movements().filter(function (m) { return String(m.movement_type) === 'reservation_release'; }).length;
  var second = runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, g12, g21);
  var afterSecond = w.movements().filter(function (m) { return String(m.movement_type) === 'reservation_release'; }).length;

  // TRUTH for a replay: success, outcome REUSED, exactly one release row, reserved 0, nothing negative. The
  // mutant cannot produce it — it either writes a second release row or is refused by the availability
  // invariant when reserved would go negative. Either way the answer differs from the truthful one.
  var truthful = (second.success === true && second.data && second.data.outcome === 'REUSED' &&
    afterSecond === afterFirst && w.reserved() === 0);
  return !truthful;
});

mut('N6  the release MOVEMENT is omitted (balance moves alone)', function () {
  var g21 = mutateFn(G21, 'factoryStockApplyDeltaTx_',
    "  fcWriteAppendByHeader_(movSheet, {\n    factory_stock_movement_id: movementId,",
    "  if (false) fcWriteAppendByHeader_(movSheet, {\n    factory_stock_movement_id: movementId,");
  var w = reservedShipment();
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, null, g21);
  return w.reserved() === 0 &&
    w.movements().filter(function (m) { return String(m.movement_type) === 'reservation_release'; }).length === 0;
});
mut('N7  the shipment is cancelled BEFORE the stock transaction succeeds', function () {
  // The status write is moved AHEAD of the release, and the release then throws. Without the ordering the
  // rollback still saves it, so the rollback is removed too — this is the half-state N7 names.
  var g12 = mutateFn(G12, 'handleCancelShipmentDraft_',
    "    var stockSheet = ss.getSheetByName('factory_stock');",
    "    (function () { var c = sh.col('status'); if (c !== -1) shipSheet.getRange(row, c + 1).setValue(SHIPMENT_CANCELLED_STATUS_); })();\n    var stockSheet = ss.getSheetByName('factory_stock');");
  g12 = mutateFn(g12, 'handleCancelShipmentDraft_',
    "    factoryStockRollbackJournal_(journal);", "    if (false) factoryStockRollbackJournal_(journal);");
  var g21 = mutateFn(G21, 'factoryStockReleaseReservationTx_',
    "  var give = Math.min(want, held);", "  var give = Math.min(want, held);\n  throw new Error('INJECTED_RELEASE_FAILURE');");
  var w = reservedShipment();
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, g12, g21);
  return String(w.shipments()[0].status) === 'cancelled' && w.reserved() === 800;
});
mut('N8  a failure SKIPS the rollback', function () {
  var g12 = mutateFn(G12, 'handleCancelShipmentDraft_',
    "    factoryStockRollbackJournal_(journal);", "    if (false) factoryStockRollbackJournal_(journal);");
  var g21 = mutateFn(G21, 'factoryStockReleaseReservationTx_',
    "  var res = factoryStockApplyDeltaTx_({",
    "  var res = factoryStockApplyDeltaTx_({");
  // Release the FIRST sku, then throw on the second, so a real partial exists to leave behind.
  var parts = cancelParts(g12, mutateFn(G21, 'factoryStockReleaseReservationTx_',
    "  var give = Math.min(want, held);",
    "  var give = Math.min(want, held);\n  if (++FSTX_TEST_CALLS_ > 1) throw new Error('INJECTED_SECOND_RELEASE_FAILURE');"), null);
  parts.unshift('var FSTX_TEST_CALLS_ = 0;');
  var w = reservedShipment({
    stock: [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 500 },
      { factory_stock_id: 'FS-2', warehouse_id: 'WH-F', sku: 'CO2200-B', fac_current_stock: 1000, fac_reserved_stock: 300 }
    ],
    movements: [
      { factory_stock_movement_id: 'M1', movement_date: '2026-09-01', sku: 'CO1100-R', warehouse_id: 'WH-F',
        movement_type: 'reservation_acquire', qty: 500, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
        before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 500 },
      { factory_stock_movement_id: 'M2', movement_date: '2026-09-01', sku: 'CO2200-B', warehouse_id: 'WH-F',
        movement_type: 'reservation_acquire', qty: 300, related_entity_type: 'shipment', related_entity_id: 'SHP-1',
        before_current_stock: 1000, after_current_stock: 1000, before_reserved_stock: 0, after_reserved_stock: 300 }
    ]
  });
  buildRunner(parts, 'handleCancelShipmentDraft_')(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' });
  // Truth: BOTH balances back to 500/300. The mutant leaves the first release applied.
  return !(w.reserved('WH-F', 'CO1100-R') === 500 && w.reserved('WH-F', 'CO2200-B') === 300);
});
mut('N9  the parent PLAN is incorrectly cancelled', function () {
  var g12 = mutateFn(G12, 'handleCancelShipmentDraft_',
    "          ['transferred_shipment_id', 'transferred_to_shipment_at'].forEach(function (nm) {",
    "          (function () { var psc = p.col('status'); if (psc !== -1) planSheet.getRange(q + 1, psc + 1).setValue('cancelled'); })();\n          ['transferred_shipment_id', 'transferred_to_shipment_at'].forEach(function (nm) {");
  var w = reservedShipment();
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, g12);
  return String(w.plans()[0].status) !== 'approved';
});
mut('N10 a cancelled shipment is still considered ACTIVE (handoff not cleared)', function () {
  var g12 = mutateFn(G12, 'handleCancelShipmentDraft_',
    "    var planSheet = ss.getSheetByName('shipping_plans');\n    var planCleared = false;\n    if (planSheet && planId) {",
    "    var planSheet = ss.getSheetByName('shipping_plans');\n    var planCleared = false;\n    if (false) {");
  var w = reservedShipment();
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, g12);
  // The plan still points at the cancelled shipment, so the card reads SHIPMENT_PRESENT and offers no Retry.
  return String(w.plans()[0].transferred_shipment_id) === 'SHP-1';
});
mut('N11 Retry REUSES the cancelled shipment', function () {
  var g12 = mutateFn(G12, 'createShipmentFromApprovedPlan_',
    "      if (rowStatus === SHIPMENT_CANCELLED_STATUS_) continue;", "      // cancelled-skip removed");
  var w = reservedShipment();
  runCancel(w, { shipment_id: 'SHP-1', actor: 'op', reason: 'r' }, g12);
  var r = runRetry(w, { shipping_plan_id: 'SP-1', actor: 'op' }, g12);
  return r.success === true && r.data.outcome === 'REUSED' && w.shipments().length === 1;
});
mut('N12 the movement vocabulary reverts to FIVE', function () {
  var g21 = G21.replace(
    "var FSTX_RESERVED_AXIS_TYPES_ = [FSTX_MOV_RESERVE_ACQUIRE_, FSTX_MOV_RESERVE_RELEASE_];",
    "var FSTX_RESERVED_AXIS_TYPES_ = [];");
  if (g21 === G21) throw new Error('mutation target absent: the reserved-axis list');
  var g21b = g21.replace(/var FSTX_MOVEMENT_TYPES_ = \[[\s\S]*?\];/,
    "var FSTX_MOVEMENT_TYPES_ = [FSTX_MOV_INVENTORY_IMPORT_, FSTX_MOV_MANUAL_ADJUSTMENT_, FSTX_MOV_PO_RECEIPT_, FSTX_MOV_SHIPMENT_OUT_, FSTX_MOV_SHIPMENT_RECEIPT_];");
  if (g21b === g21) throw new Error('mutation target absent: the type list');
  var p = new Function('Utilities', 'SpreadsheetApp', 'fcWriteAppendByHeader_',
    'var OUT;' + core21(g21b) + NL + 'return { TYPES: FSTX_MOVEMENT_TYPES_, isKnown: factoryStockIsKnownMovementType_, isRes: factoryStockIsReservationMovement_ };')(
    gasServices().Utilities, { flush: function () {} }, appendByHeader);
  return p.TYPES.length === 5 && p.isKnown('reservation_acquire') === false && p.isRes('reservation_acquire') === false;
});
mut('N13 a reservation row is treated as a CURRENT-stock delta', function () {
  var g21 = G21.replace(
    "var FSTX_CURRENT_AXIS_TYPES_ = [FSTX_MOV_INVENTORY_IMPORT_, FSTX_MOV_MANUAL_ADJUSTMENT_,\n  FSTX_MOV_PO_RECEIPT_, FSTX_MOV_SHIPMENT_OUT_];",
    "var FSTX_CURRENT_AXIS_TYPES_ = [FSTX_MOV_INVENTORY_IMPORT_, FSTX_MOV_MANUAL_ADJUSTMENT_,\n  FSTX_MOV_PO_RECEIPT_, FSTX_MOV_SHIPMENT_OUT_, FSTX_MOV_RESERVE_ACQUIRE_, FSTX_MOV_RESERVE_RELEASE_];");
  if (g21 === G21) throw new Error('mutation target absent: the current-axis list');
  var p = new Function('Utilities', 'SpreadsheetApp', 'fcWriteAppendByHeader_',
    'var OUT;' + core21(g21) + NL + 'return factoryStockIsCurrentMovement_;')(
    gasServices().Utilities, { flush: function () {} }, appendByHeader);
  // A reservation counted on the current axis is how 800 reserved units get reported as 800 units of
  // physical movement that never happened.
  return p('reservation_acquire') === true;
});
mut('N14 dispatch DOUBLE-releases the reservation (a second release row)', function () {
  var g22 = mutateFn(G22, 'handleConfirmShipmentAndDispatch_',
    "      reservationReleased += give;",
    "      if (give > 0) factoryStockApplyDeltaTx_({ stockSheet: stk.sheet, movSheet: movSheet, warehouseId: d.warehouseId, sku: d.sku, deltaQty: 0, reservedDelta: -give, journal: rollback, now: now, movementType: FSTX_MOV_RESERVE_RELEASE_, relatedEntityType: 'shipment', relatedEntityId: shipmentId, createdBy: actor });\n      reservationReleased += give;");
  var w = reservedShipment();
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, g22);
  // Truth: reserved 0 via ONE shipment_out row and NO standalone release. The double release either drives
  // reserved negative (refused, rolling everything back) or writes an extra row.
  var extra = w.movements().filter(function (m) { return String(m.movement_type) === 'reservation_release'; }).length;
  return extra > 0 || r.success !== true || w.reserved() !== 0;
});
mut('N15 the reconciliation counts shipment_out TWICE', function () {
  // The dispatch drop is subtracted once via dispatch_released. Adding it to release_total as WELL is the
  // double-count §H.1 forbids, and it makes a perfectly healthy dispatched world read as a mismatch — the
  // noise that teaches an operator to stop reading the report.
  var g21 = mutateFn(G21, 'factoryStockReconcileReservations_',
    "        sl.dispatch_released += drop;",
    "        sl.dispatch_released += drop;\n        sl.release_total -= drop;");
  var p = new Function('Utilities', 'SpreadsheetApp', 'fcWriteAppendByHeader_',
    'var OUT;' + core21(g21) + NL + 'return factoryStockReconcileReservations_;')(
    gasServices().Utilities, { flush: function () {} }, appendByHeader);
  // A perfectly healthy dispatched-and-released world must NOT be reported as a mismatch.
  var rec = p(
    [{ warehouse_id: 'WH-F', sku: 'S1', fac_current_stock: 200, fac_reserved_stock: 0 }],
    [{ movement_type: 'reservation_acquire', qty: 800, warehouse_id: 'WH-F', sku: 'S1',
       related_entity_type: 'shipment', related_entity_id: 'A', before_reserved_stock: 0, after_reserved_stock: 800 },
     { movement_type: 'shipment_out', qty: -800, warehouse_id: 'WH-F', sku: 'S1',
       related_entity_type: 'shipment', related_entity_id: 'A', before_reserved_stock: 800, after_reserved_stock: 0 }]);
  return rec.code === 'FACTORY_RESERVATION_LEDGER_MISMATCH';
});
mut('N16 the PO over-receipt still CLAMPS', function () {
  var g13 = mutateFn(G13, 'poReceiptEvaluateLine_',
    "  if (recv > maxRecv) {\n    return { status: 'error', issue: 'PO_RECEIPT_EXCEEDS_REMAINING_QTY',",
    "  if (recv > maxRecv) { recv = maxRecv; }\n  if (false) {\n    return { status: 'error', issue: 'PO_RECEIPT_EXCEEDS_REMAINING_QTY',");
  var w = receiptWorld();
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'X1',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 900 }] }, g13);
  return r.success === true && Number(w.lines()[0].completed_qty) === 500;
});
mut('N17 the PO over-receipt WRITES stock', function () {
  var g13 = mutateFn(G13, 'poReceiptEvaluateLine_',
    "  if (recv > maxRecv) {\n    return { status: 'error', issue: 'PO_RECEIPT_EXCEEDS_REMAINING_QTY',",
    "  if (false) {\n    return { status: 'error', issue: 'PO_RECEIPT_EXCEEDS_REMAINING_QTY',");
  var w = receiptWorld();
  runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'X2',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 900 }] }, g13);
  return Number(w.stock()[0].fac_current_stock) !== 1000 || w.movements().length > 0;
});
mut('N18 the typed over-receipt code is FLATTENED into prose', function () {
  var g13 = mutateFn(G13, 'handleReceivePurchaseOrderLines_',
    "          success: false, code: ev.issue, issue: ev.issue, purchase_order_line_id: lineId,",
    "          success: false, purchase_order_line_id: lineId,");
  var w = receiptWorld();
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'X3',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 900 }] }, g13);
  // The refusal still happens, but the caller can no longer bind to a code or read the three quantities.
  return r.success === false && !r.code;
});
mut('N19 the UI cancel has NO confirmation', function () {
  var page = SHPAGE.replace("    if (!confirm(lines.join('\\n'))) return;", "    // confirmation removed");
  if (page === SHPAGE) throw new Error('mutation target absent: the cancel confirmation');
  var fn = (function (src) {
    var i = src.indexOf('function shCancelShipmentDraft(');
    var d = 0, started = false;
    for (var j = i; j < src.length; j++) {
      if (src[j] === '{') { d++; started = true; }
      else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    return '';
  })(page);
  return fn.length > 0 && !/confirm\(/.test(fn);
});
mut('N20 a deployment mismatch still allows the cancel', function () {
  // EXECUTED, not reasoned about. checkPageDeploymentContract filters the deployment's missing-action list
  // down to the actions the PAGE requires; anything outside that set is invisible to the page verdict. So the
  // question is measurable: given a deployment that reports cancelShipmentDraft missing, does the page's
  // filter still see it? The mutant drops the action from the page set, and it must stop seeing it.
  function pageVerdict(apiSrc) {
    var set = (apiSrc.match(/'shipment-draft':\s*\[([\s\S]*?)\]/) || [])[1] || '';
    var required = (set.match(/'[^']+'/g) || []).map(function (x) { return x.replace(/'/g, ''); });
    // The real filter, transcribed from checkPageDeploymentContract: missing actions narrowed to `required`.
    var reportedMissing = ['cancelShipmentDraft'];
    var visible = reportedMissing.filter(function (m) { return required.indexOf(m) !== -1; });
    return { ok: visible.length === 0, visible: visible };
  }
  var truth = pageVerdict(DBAPI);
  if (truth.ok !== false) throw new Error('probe error: the shipped page set does not see the missing action');
  var api = DBAPI.replace(
    "    'shipment-draft': ['shipment.workspace.get', 'cancelShipmentDraft', 'updateShipment',",
    "    'shipment-draft': ['shipment.workspace.get', 'updateShipment',");
  if (api === DBAPI) throw new Error('mutation target absent: the shipment-draft required set');
  var mutated = pageVerdict(api);
  // Caught when the mutant reports the page as HEALTHY while the deployment cannot route the cancel.
  return mutated.ok === true;
});

// ================================================================================================================
console.log('\n---');
console.log(pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
if (fail) process.exit(1);
