// F1-5B-SHIP-R3A — Canonical PO → FIFO Allocation → Shipment Line foundation.
//
// shipment_line_allocations is the CANONICAL PO-CONSUMPTION LINEAGE authority: WHO (shipment line) consumed
// WHICH purchase_order_line and HOW MUCH. It does NOT own physical shipment qty (that stays on
// shipment_lines.shipment_qty), PO ordered/completed/shipped qty, or factory stock.
//
// Frozen business model (USER-approved, F1-5B-SHIP-R3A §0):
//   • Physical truth = shipment_lines.shipment_qty.  1 shipment_line → N shipment_line_allocations → N PO lines.
//   • Factory is SHARED across companies. Matching = SKU + business company + physical factory, all INDEPENDENT.
//     Factory NEVER implies company; company NEVER implies factory.
//   • FIFO = order_date ASC → po_no ASC → purchase_order_line_id ASC. Blank order_date is NEVER eligible
//     (no created_at fallback). Only issued/executable POs enter FIFO.
//   • Physical shippable capacity = max(0, completed_qty − shipped_qty). Draft availability additionally
//     subtracts OTHER active shipment lines' draft reservations (a line never reserves against itself twice).
//   • R3A persists DRAFT allocations only — it does NOT mutate purchase_order_lines.shipped_qty (that is R3B
//     at the existing Confirm & Dispatch boundary). Fail-closed (PO_CAPACITY_INSUFFICIENT) — never partial.
//
// Requires the shipment_line_allocations sheet to exist (USER-authorized migration — §8/§10). Runtime FAILS
// CLOSED (SHIPMENT_LINE_ALLOCATIONS_SCHEMA_MISSING) if absent — never auto-creates, never silently skips.

// Minimal canonical schema (§9). Denormalized shipment_id/purchase_order_id/sku/company/factory_id are scope
// guards + readback/diagnostics only (NEVER authority). executed_at + reversal_* are R3B lifecycle lineage.
var SHIPMENT_LINE_ALLOCATIONS_HEADERS_ = [
  'shipment_line_allocation_id',   // PK  (SLA-…)
  'shipment_id',                   // parent shipment (scoping + bulk ops)
  'shipment_line_id',              // FK → shipment_lines.shipment_line_id (physical qty owner)
  'purchase_order_id',             // denormalized parent (readback / documents)
  'purchase_order_line_id',        // FK → purchase_order_lines (the consumed PO line)
  'sku', 'company', 'factory_id',  // denormalized scope guard + diagnostics (not authority)
  'allocated_qty',                 // this allocation's consumed qty (PO-consumption lineage ONLY)
  'allocation_status',             // draft | executed | reversed
  'fifo_rank',                     // deterministic order this allocation was generated at (audit)
  'created_by', 'created_at', 'updated_by', 'updated_at',
  'executed_at',                   // R3B stamp (draft → executed at dispatch)
  'reversed_by', 'reversed_at', 'reversal_reason'   // reversal lineage (R3B / policy round)
];

// eligible PO header statuses (issued / executable only; pre-issue draft & pending_approval NEVER eligible).
var SLA_ELIGIBLE_PO_STATUS_ = { issued: 1, confirmed: 1, in_production: 1, ready_to_ship: 1, completed: 1 };

// __SLA_PURE_START__  (deterministic, Node-testable — no SpreadsheetApp / no clock / no randomness)
function slaNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function slaStr_(v) { return String(v == null ? '' : v).trim(); }
function slaLc_(v) { return slaStr_(v).toLowerCase(); }

// Deterministic FIFO comparator: order_date ASC, po_no ASC, purchase_order_line_id ASC. (Blank order_date lines
// are filtered out BEFORE sorting, so ordering never depends on them — and never on created_at / row order.)
function slaFifoCompare_(a, b) {
  var da = slaStr_(a.order_date), db = slaStr_(b.order_date);
  if (da !== db) return da < db ? -1 : 1;
  var pa = slaStr_(a.po_no), pb = slaStr_(b.po_no);
  if (pa !== pb) return pa < pb ? -1 : 1;
  var la = slaStr_(a.purchase_order_line_id), lb = slaStr_(b.purchase_order_line_id);
  return la < lb ? -1 : (la > lb ? 1 : 0);
}

// §4/§11 eligibility — ALL independent: same sku, same business company, same physical factory, issued/executable
// PO status, and a nonblank order_date. Factory is NEVER used to infer company (and vice-versa).
function slaIsEligible_(poLine, scope) {
  if (slaLc_(poLine.sku) !== slaLc_(scope.sku)) return false;
  if (slaLc_(poLine.company) !== slaLc_(scope.company)) return false;              // company independent
  if (slaLc_(poLine.factory_id) !== slaLc_(scope.factory_id)) return false;        // factory independent (shared across companies)
  if (!SLA_ELIGIBLE_PO_STATUS_[slaLc_(poLine.order_status)]) return false;         // pre-issue excluded
  if (slaStr_(poLine.order_date) === '') return false;                             // §3 blank order_date NEVER eligible
  return true;
}

// §14/§15 draft availability for THIS shipment line: completed − shipped − Σ(OTHER active shipment-line reservations
// on this PO line). Self reservations are released (excluded) so a recompute never double-counts the current line.
function slaReservedByOthers_(existingAllocations, selfShipmentLineId) {
  var m = {};
  (existingAllocations || []).forEach(function (a) {
    var st = slaLc_(a.allocation_status);
    if (st !== 'draft' && st !== 'executed') return;                               // reversed never reserves
    if (slaStr_(a.shipment_line_id) === slaStr_(selfShipmentLineId)) return;       // §15 release self
    var k = slaStr_(a.purchase_order_line_id);
    m[k] = (m[k] || 0) + slaNum_(a.allocated_qty);
  });
  return m;
}
function slaAvailability_(poLine, reservedByOthers) {
  return Math.max(0, slaNum_(poLine.completed_qty) - slaNum_(poLine.shipped_qty) - slaNum_(reservedByOthers));
}

// §7/§12/§17 canonical FIFO allocator for ONE shipment line. Pure + deterministic (row order irrelevant). Returns
// the full allocation plan, or a FAIL-CLOSED PO_CAPACITY_INSUFFICIENT result (never a partial allocation).
function slaAllocateShipmentLine_(scope, poLinesJoined, existingAllocations) {
  var need = slaNum_(scope.shipment_qty);
  var reserved = slaReservedByOthers_(existingAllocations, scope.shipment_line_id);
  var eligible = (poLinesJoined || [])
    .filter(function (p) { return slaIsEligible_(p, scope); })
    .map(function (p) { return { po: p, avail: slaAvailability_(p, reserved[slaStr_(p.purchase_order_line_id)] || 0) }; })
    .filter(function (e) { return e.avail > 0; });
  eligible.sort(function (a, b) { return slaFifoCompare_(a.po, b.po); });
  var totalAvail = eligible.reduce(function (s, e) { return s + e.avail; }, 0);

  var allocations = [], remaining = need, rank = 0;
  for (var i = 0; i < eligible.length && remaining > 0; i++) {
    var take = Math.min(remaining, eligible[i].avail);
    if (take <= 0) continue;
    rank++;
    allocations.push({
      purchase_order_id: slaStr_(eligible[i].po.purchase_order_id),
      purchase_order_line_id: slaStr_(eligible[i].po.purchase_order_line_id),
      allocated_qty: take, fifo_rank: rank
    });
    remaining -= take;
  }
  if (remaining > 0) {
    return { ok: false, error: 'PO_CAPACITY_INSUFFICIENT', shipment_line_id: slaStr_(scope.shipment_line_id),
      sku: slaStr_(scope.sku), company: slaStr_(scope.company), factory_id: slaStr_(scope.factory_id),
      shipment_qty: need, available_capacity: totalAvail, shortage_qty: need - totalAvail,
      eligible_po_lines: eligible.map(function (e) { return { purchase_order_line_id: slaStr_(e.po.purchase_order_line_id), available: e.avail }; }) };
  }
  return { ok: true, shipment_line_id: slaStr_(scope.shipment_line_id), allocations: allocations,
    allocated_total: allocations.reduce(function (s, a) { return s + a.allocated_qty; }, 0) };
}

// Plan a SET of shipment lines in one deterministic pass (§24 I multi-SKU + intra-shipment contention). Each line
// sees the prior planned lines' allocations as reservations (accumulated). Fail-closed atomically: if ANY line
// cannot be fully allocated, the whole plan fails (caller persists nothing).
function slaBuildPlan_(scopes, poLinesJoined, existingAllocations) {
  var acc = (existingAllocations || []).slice();
  var results = [];
  for (var i = 0; i < scopes.length; i++) {
    var r = slaAllocateShipmentLine_(scopes[i], poLinesJoined, acc);
    if (!r.ok) return { ok: false, failure: r, results: results };
    results.push(r);
    // reserve this line's freshly-planned allocations for subsequent lines (as draft, keyed to this line).
    r.allocations.forEach(function (a) {
      acc.push({ shipment_line_id: r.shipment_line_id, purchase_order_line_id: a.purchase_order_line_id,
        allocated_qty: a.allocated_qty, allocation_status: 'draft' });
    });
  }
  return { ok: true, results: results };
}
// __SLA_PURE_END__

// ---- Apps Script persistence layer (reads canonical sheets; ScriptLock; fail-closed; DRAFT only) --------------

// §5 shipment business company = persisted shipments.company (NEVER inferred from factory/warehouse/sku/dest).
// §6 shipment physical factory = warehouses[source_warehouse_id].factory_id via the EXISTING resolver. Returns
// null when the master yields no factory (so the caller can FAIL CLOSED — never a warehouse-id or a guess).
function slaResolveShipmentFactory_(ss, sourceWarehouseId) {
  var wid = slaStr_(sourceWarehouseId);
  if (!wid) return null;
  var resolved = procurementResolveFactoryId_(ss, wid, '');   // reuse canonical PO-side resolver (warehouses master)
  // procurementResolveFactoryId_ returns the warehouse_id itself when no factory mapping exists — treat that
  // (resolved === wid) as UNRESOLVED for attribution purposes (a warehouse is not a factory).
  if (!resolved || slaStr_(resolved) === wid) return null;
  return slaStr_(resolved);
}

// Join purchase_order_lines with their header (company/factory_id/order_date/po_no/order_status) — the FIFO +
// matching authority. company is read from the LINE (denormalized canonical) with header fallback.
function slaLoadPoLinesJoined_(ss) {
  var poSheet = ss.getSheetByName('purchase_orders');
  var polSheet = ss.getSheetByName('purchase_order_lines');
  if (!poSheet || !polSheet) return [];
  var pd = poSheet.getDataRange().getValues(); if (pd.length < 2) return [];
  var ph = pd[0].map(function (x) { return slaStr_(x); });
  var pById = {};
  var cId = ph.indexOf('purchase_order_id'), cNo = ph.indexOf('po_no'), cFac = ph.indexOf('factory_id'),
      cCo = ph.indexOf('company'), cDate = ph.indexOf('order_date'), cStat = ph.indexOf('order_status');
  for (var i = 1; i < pd.length; i++) {
    var id = slaStr_(pd[i][cId]); if (!id) continue;
    pById[id] = { po_no: cNo !== -1 ? slaStr_(pd[i][cNo]) : '', factory_id: cFac !== -1 ? slaStr_(pd[i][cFac]) : '',
      company: cCo !== -1 ? slaStr_(pd[i][cCo]) : '', order_date: cDate !== -1 ? slaStr_(pd[i][cDate]) : '',
      order_status: cStat !== -1 ? slaStr_(pd[i][cStat]) : '' };
  }
  var ld = polSheet.getDataRange().getValues(); if (ld.length < 2) return [];
  var lh = ld[0].map(function (x) { return slaStr_(x); });
  function lc(n) { return lh.indexOf(n); }
  var out = [];
  for (var j = 1; j < ld.length; j++) {
    var poId = lc('purchase_order_id') !== -1 ? slaStr_(ld[j][lc('purchase_order_id')]) : '';
    var hdr = pById[poId] || { po_no: '', factory_id: '', company: '', order_date: '', order_status: '' };
    out.push({
      purchase_order_line_id: lc('purchase_order_line_id') !== -1 ? slaStr_(ld[j][lc('purchase_order_line_id')]) : '',
      purchase_order_id: poId,
      po_no: hdr.po_no, order_date: hdr.order_date, order_status: hdr.order_status,
      sku: lc('sku') !== -1 ? slaStr_(ld[j][lc('sku')]) : '',
      company: lc('company') !== -1 && slaStr_(ld[j][lc('company')]) ? slaStr_(ld[j][lc('company')]) : hdr.company,
      factory_id: hdr.factory_id,     // PO factory is header-owned (procurementResolveFactoryId_ at PO create)
      completed_qty: lc('completed_qty') !== -1 ? slaNum_(ld[j][lc('completed_qty')]) : 0,
      shipped_qty: lc('shipped_qty') !== -1 ? slaNum_(ld[j][lc('shipped_qty')]) : 0
    });
  }
  return out;
}

function slaReadObjects_(sheet) {
  var d = sheet.getDataRange().getValues(); if (d.length < 2) return [];
  var h = d[0].map(function (x) { return slaStr_(x); });
  var out = [];
  for (var i = 1; i < d.length; i++) { var o = {}; for (var c = 0; c < h.length; c++) o[h[c]] = d[i][c]; out.push(o); }
  return out;
}

/**
 * Generate/reconcile DRAFT shipment_line_allocations for a shipment (canonical FIFO PO consumption preview).
 * Body: { shipment_id, actor? }. Reconciliation-based (§15): this shipment's existing DRAFT allocations are
 * released and replaced atomically; other shipments' active reservations are honored (§14/§16). Fail-closed on
 * PO_CAPACITY_INSUFFICIENT / SHIPMENT_FACTORY_ATTRIBUTION_GAP — persists NOTHING partial. Never touches shipped_qty.
 */
function handleGenerateShipmentLineAllocations_(body) {
  var shipmentId = slaStr_(body && body.shipment_id);
  var actor = slaStr_(body && (body.actor || body.updated_by)) || 'system_user';
  if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id' });

  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // §25 FAIL CLOSED if the canonical table is absent — never auto-create, never silently skip persistence.
    var slaSheet = ss.getSheetByName('shipment_line_allocations');
    if (!slaSheet) return jsonResponse_({ success: false, error: 'SHIPMENT_LINE_ALLOCATIONS_SCHEMA_MISSING', stage: 'schema' });

    var shipSheet = ss.getSheetByName('shipments'), lineSheet = ss.getSheetByName('shipment_lines');
    if (!shipSheet || !lineSheet) return jsonResponse_({ success: false, error: 'shipments/shipment_lines sheet not found', stage: 'load' });

    var shipments = slaReadObjects_(shipSheet);
    var ship = null; for (var i = 0; i < shipments.length; i++) { if (slaStr_(shipments[i].shipment_id) === shipmentId) { ship = shipments[i]; break; } }
    if (!ship) return jsonResponse_({ success: false, error: 'Shipment not found: ' + shipmentId, stage: 'load' });

    var company = slaStr_(ship.company);                          // §5 canonical persisted business company
    var factoryId = slaResolveShipmentFactory_(ss, ship.source_warehouse_id);   // §6 physical factory
    if (!company) return jsonResponse_({ success: false, error: 'SHIPMENT_COMPANY_AUTHORITY_GAP', stage: 'attribution', shipment_id: shipmentId });
    if (!factoryId) return jsonResponse_({ success: false, error: 'SHIPMENT_FACTORY_ATTRIBUTION_GAP', stage: 'attribution', shipment_id: shipmentId, source_warehouse_id: slaStr_(ship.source_warehouse_id) });

    var lines = slaReadObjects_(lineSheet).filter(function (l) { return slaStr_(l.shipment_id) === shipmentId; });
    var scopes = lines.map(function (l) {
      return { shipment_line_id: slaStr_(l.shipment_line_id), sku: slaStr_(l.sku), company: company,
        factory_id: factoryId, shipment_qty: slaNum_(l.shipment_qty) };
    }).filter(function (s) { return s.shipment_line_id && s.sku && s.shipment_qty > 0; });
    if (!scopes.length) return jsonResponse_({ success: false, error: 'Shipment has no allocatable lines', stage: 'load' });

    var poLines = slaLoadPoLinesJoined_(ss);
    var allAlloc = slaReadObjects_(slaSheet);
    // Release THIS shipment's own DRAFT allocations from the reservation set (they are being recomputed).
    var selfLineIds = {}; scopes.forEach(function (s) { selfLineIds[s.shipment_line_id] = 1; });
    var externalAlloc = allAlloc.filter(function (a) {
      return !(slaLc_(a.allocation_status) === 'draft' && selfLineIds[slaStr_(a.shipment_line_id)]);
    });

    var plan = slaBuildPlan_(scopes, poLines, externalAlloc);
    if (!plan.ok) return jsonResponse_({ success: false, error: plan.failure.error, stage: 'capacity', detail: plan.failure });

    // ---- persist: replace this shipment's DRAFT allocation set (delete-then-append; reconciliation, not delta) ----
    var d = slaSheet.getDataRange().getValues();
    var h = d[0].map(function (x) { return slaStr_(x); });
    var cLine = h.indexOf('shipment_line_id'), cStat = h.indexOf('allocation_status');
    if (cLine !== -1 && cStat !== -1) {
      for (var r = d.length - 1; r >= 1; r--) {
        if (slaLc_(d[r][cStat]) === 'draft' && selfLineIds[slaStr_(d[r][cLine])]) slaSheet.deleteRow(r + 1);
      }
    }
    var now = procurementTimestamp_();
    var persisted = [];
    plan.results.forEach(function (res) {
      res.allocations.forEach(function (a) {
        var sla = { shipment_line_allocation_id: 'SLA-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
          shipment_id: shipmentId, shipment_line_id: res.shipment_line_id, purchase_order_id: a.purchase_order_id,
          purchase_order_line_id: a.purchase_order_line_id, sku: '', company: company, factory_id: factoryId,
          allocated_qty: a.allocated_qty, allocation_status: 'draft', fifo_rank: a.fifo_rank,
          created_by: actor, created_at: now, updated_by: actor, updated_at: now,
          executed_at: '', reversed_by: '', reversed_at: '', reversal_reason: '' };
        procurementAppendByHeader_(slaSheet, sla);
        persisted.push({ shipment_line_id: res.shipment_line_id, purchase_order_line_id: a.purchase_order_line_id, allocated_qty: a.allocated_qty, fifo_rank: a.fifo_rank });
      });
    });

    return jsonResponse_({ success: true, data: { shipment_id: shipmentId, company: company, factory_id: factoryId,
      allocations: persisted, line_count: scopes.length, shipped_qty_changed: false } });
  } finally { try { lock.releaseLock(); } catch (e2) { /* best-effort release */ } }
}
