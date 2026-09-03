// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 12_shipment_handlers.gs — Shipment (Execution Layer) writes — EXECUTION COMMIT
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements the Execution Commit defined in:
//   - SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md §3A (Execution Commit) / §4A (Execution Snapshot)
//   - SHIPMENT_CENTER_SPEC.md §2 / §15 (approval creates shipments + shipment_lines = draft)
//   - WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md §12 (Plan → Shipment field copy)
//
//   createShipmentFromApprovedPlan_ : Approved shipping_plan → shipments + shipment_lines (draft)
//                                     COPIES the Decision Snapshot into the Execution Snapshot.
//                                     NEVER recalculates Current Stock / Avg Sales / Days of Supply /
//                                     Suggested Qty / Target Days / FC / Event — all are copied.
//   handleCreateShipmentFromPlan_   : explicit action wrapper (idempotent retry)
//   handleUpdateShipment_           : edit EXECUTION-layer fields only (carrier/container/booking/
//                                     ETD/ETA/tracking/remark/...) — Decision/Execution Snapshot is
//                                     immutable and can NEVER be edited here.
// Tables live in the OPERATION DB spreadsheet. If a tab is missing it is created with the documented
// header row (the two NEW Execution-Layer tables only — no existing table/field is altered).
// ============================================================

// CANONICAL shipments header (2026-07-28 DB sync). Warehouse endpoints: source_warehouse_id (out-source
// identity — the shipment source, resolved via the Warehouse Master; NO origin_warehouse_id / origin_type),
// warehouse_code (KEPT = DESTINATION warehouse code snapshot — semantic unchanged), destination_warehouse_id
// (out-destination identity) + destination_type. last_mile_delivery appears ONCE (the trailing duplicate in
// the canonical decision list is intentionally NOT re-added — no duplicate header). estimated_* = Phase-1
// rough/exact estimate; *_actual = manual actuals. Retained-legacy columns (warehouse_id / total_gross_weight
// / total_net_weight / updated_by) are additive read-fallbacks (never deleted; never re-created if absent).
var SHIPMENTS_HEADERS_ = [
  'shipment_id', 'shipment_no', 'shipping_plan_id', 'external_shipment_id', 'reference_id',
  'source_warehouse_id', 'warehouse_code', 'company', 'country', 'marketplace',
  'ship_from', 'destination', 'destination_warehouse_id', 'destination_type',
  'carrier_id', 'rate_card_id', 'shipping_method', 'last_mile_delivery', 'shipments_customs_type', 'import_duty_treatment', 'status', 'sales_order_id',
  'booking_no', 'master_tracking_number', 'tracking_number', 'container_no', 'bl_no', 'invoice_no',
  'etd', 'eta', 'is_cross_dock', 'temperature_requirement', 'hazmat_flag',
  'actual_departure_date', 'actual_arrival_date', 'customs_clearance_date', 'delivered_date',
  // Quantity totals — CANONICAL renamed columns. Legacy total_qty / total_cartons / total_cbm are RETIRED
  // (read-fallback only; never re-ensured).
  'shipment_total_qty', 'shipment_total_cartons', 'shipment_total_cbm', 'shipment_total_gross_weight', 'shipment_total_net_weight',
  // Phase-1 estimated cost (rough on plan, exact on shipment) + manual actuals.
  'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'estimated_unit_cost',
  'freight_cost_actual', 'duty_actual', 'total_cost_actual', 'currency', 'note',
  'created_by', 'created_at', 'updated_at',
  // Ship / Done lifecycle metadata (Shipment Draft workspace).
  'shipped_at', 'shipped_by', 'hidden_from_draft_at', 'hidden_from_draft_by',
  // Retained legacy (additive read-fallback; never deleted / re-created).
  'warehouse_id', 'total_gross_weight', 'total_net_weight', 'updated_by'
];

// NOTE: shipment_lines.shipment_carton_cbm = LINE-TOTAL CBM (m³) for the whole line/SKU quantity —
// NOT per-carton. gross_weight / net_weight are likewise LINE totals. The per-carton × carton-qty
// multiplication happens once UPSTREAM (shipping_plan_lines.cbm) or once at Execution Commit; the
// header shipment_total_cbm = Σ shipment_carton_cbm (never re-multiplied). Legacy carton_cbm (old
// per-carton column) is read-fallback only and is never written/ensured.
var SHIPMENT_LINES_HEADERS_ = [
  'shipment_line_id', 'shipment_id', 'sku',
  // shipment_qty = CANONICAL renamed column (was qty; legacy read-fallback only).
  // shipment_carton_qty = CANONICAL renamed column (was carton_qty; legacy read-fallback only).
  // shipment_carton_cbm = CANONICAL renamed column (was carton_cbm; now LINE-TOTAL, legacy fallback only).
  'shipment_qty', 'factory_stock_allocation_qty', 'shipment_carton_qty', 'carton_no_start', 'carton_no_end',
  'units_per_carton', 'shipment_carton_cbm', 'gross_weight', 'net_weight',
  'purchase_order_line_id',
  // F1-SHIPMENT-INCOMING-R6 — FROZEN receiver lineage. 1:1 dispatch mapping (one shipping_plan_line →
  // one shipment_line, proven no SKU consolidation), so a single id is sufficient (NO CSV / JSON-in-cell).
  // Resolves the merged (MULTI) shipment's per-line receiver via shipping_plan_line_id → shipping_plan_lines
  // → shipping_plans {company,country,marketplace}. Blank on historical rows (fail-closed / MULTI).
  'shipping_plan_line_id',
  'note', 'created_at', 'updated_at',
  // Execution Snapshot = a verbatim COPY of the Decision Snapshot (ARCHITECTURE §4A). Never recalculated.
  'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply',
  'snapshot_suggested_qty', 'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context',
  'snapshot_avg_sales_source', 'snapshot_avg_sales_warning',
  // Receipt authority (F1-SHIPMENT-RECEIPT-R1B — CONTRACT DRIFT REPAIR). shipment_received_qty ALREADY
  // EXISTS in the LIVE DB (user-confirmed 2026-08-11); this line only aligns the repo/Apps Script header
  // contract to that live column. It is CUMULATIVE physically-received quantity. NO duplicate received
  // field is added; remaining_qty is runtime-derived (max(shipment_qty - shipment_received_qty, 0)) and is
  // NOT persisted. Historical blanks normalize to 0 at read time (never a bulk row rewrite).
  'shipment_received_qty'
];

// Execution-layer fields a user MAY edit on a Shipment (everything else — identity, the six-key
// context, totals, and the whole Execution Snapshot — is immutable here).
var SHIPMENT_EDITABLE_FIELDS_ = [
  'external_shipment_id',
  'carrier_id', 'rate_card_id', 'shipping_method', 'last_mile_delivery', 'shipments_customs_type', 'import_duty_treatment',
  'booking_no', 'master_tracking_number', 'tracking_number', 'container_no', 'bl_no', 'invoice_no',
  'etd', 'eta', 'is_cross_dock', 'temperature_requirement', 'hazmat_flag',
  'actual_departure_date', 'actual_arrival_date', 'customs_clearance_date', 'delivered_date',
  'shipment_total_cbm', 'shipment_total_gross_weight', 'shipment_total_net_weight',
  'freight_cost_actual', 'duty_actual', 'total_cost_actual', 'currency',
  // Warehouse Picker (SHIPMENT_CENTER_SPEC §22.0). CANONICAL: source_warehouse_id (out-source identity),
  // destination_warehouse_id (out-destination identity) + destination_type; warehouse_code = DESTINATION
  // warehouse code SNAPSHOT (semantic unchanged — never a source code). Legacy warehouse_id (the old
  // destination identity) is still accepted and MIRRORED onto destination_warehouse_id (see handleUpdateShipment_).
  'source_warehouse_id', 'destination_warehouse_id', 'destination_type', 'warehouse_id', 'warehouse_code', 'reference_id', 'note'
];

function shipmentTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
function shipmentToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function shipmentNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

// Read an arbitrary carrier_rate_cards column for a rate_card_id (READ-ONLY). Returns '' when the
// table / column / row / value is absent. Used by the customs_type snapshot resolver.
function shipmentRateCardField_(ss, rateCardId, fieldName) {
  var id = String(rateCardId || '').trim();
  if (!id) return '';
  var sh = ss.getSheetByName('carrier_rate_cards');
  if (!sh) return '';
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return '';
  var h = data[0].map(function (x) { return String(x).trim(); });
  var idc = h.indexOf('rate_card_id'), fc = h.indexOf(fieldName);
  if (idc === -1 || fc === -1) return '';
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idc]).trim() === id) return String(data[i][fc] == null ? '' : data[i][fc]).trim();
  }
  return '';
}

// Resolve the Shipment shipments_customs_type SNAPSHOT value. Priority: (1) a value already on the
// plan/body, (2) carrier_rate_cards.customs_type by rate_card_id (the Rate Card SOURCE field — its name
// is unchanged). Blank when nothing is available (nullable). Result is stored on shipments.shipments_customs_type.
function shipmentCustomsType_(ss, rateCardId, presetCustomsType) {
  var v = String(presetCustomsType || '').trim();
  if (v) return v;
  return shipmentRateCardField_(ss, rateCardId, 'customs_type');
}

// RETIRED (2026-07-28 Canonical Decision): shipments.shipping_method_label / shipments_customs_type_label
// are NO LONGER persisted. Display text is resolved at RENDER time from the Code fields (shipping_method /
// last_mile_delivery / shipments_customs_type) — see the frontend Code→display resolver. The old snapshot
// resolvers (shipmentMethodLabel_ / shipmentCustomsTypeLabel_ / shipmentRateCardLabel_) were removed.

/** Marketplace short code for the external_shipment_id default (unknown -> first 3 chars uppercased). */
var SHIPMENT_MARKETPLACE_ABBREV_ = {
  amazon: 'AMZ', walmart: 'WMT', shopify: 'SHP', ebay: 'EBY', target: 'TGT', wayfair: 'WYF'
};
function shipmentMarketplaceAbbrev_(marketplace) {
  var m = String(marketplace == null ? '' : marketplace).trim();
  if (!m) return '';
  var key = m.toLowerCase();
  if (SHIPMENT_MARKETPLACE_ABBREV_[key]) return SHIPMENT_MARKETPLACE_ABBREV_[key];
  return m.toUpperCase().replace(/[^A-Z0-9]+/g, '').substring(0, 3);
}

/** Get (or create with the documented header row) an Execution-Layer tab. */
// Production Safety Round S0.5 (RULE S0-2/S0-5): VALIDATE-ONLY (no auto-create / no Header write). Delegates to the
// shared safety adapter (29_); create is migration-only (prodMigrateCreateSheet_), unreachable from Runtime.
function shipmentEnsureSheet_(ss, name, headers) {
  return prodRequireSheet_(ss, name, headers);
}

/** Append a row using the sheet's existing header row (writes only known columns). */
function shipmentAppendByHeader_(sheet, obj) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var row = new Array(headers.length).fill('');
  for (var i = 0; i < headers.length; i++) {
    if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) {
      row[i] = obj[headers[i]];
    }
  }
  sheet.appendRow(row);
}

/** Read a sheet as {headers, rows(values), colIndex(name)}. */
function shipmentReadSheet_(sheet) {
  var data = sheet.getDataRange().getValues();
  var headers = (data[0] || []).map(function (h) { return String(h).trim(); });
  return {
    headers: headers,
    rows: data,
    col: function (n) { return headers.indexOf(n); }
  };
}

/**
 * Find an existing shipment for a shipping_plan_id. Robust to the column name used to record the
 * plan reference (shipping_plan_id / source_shipping_plan_id / plan_id). Returns the shipment_id
 * (or '' when none). Lets Weekly Shipping Plan Done detect the Execution Commit even when the
 * plan's own transferred_shipment_id column was never persisted. Shared global scope (used by 11_).
 */
function shipmentFindForPlan_(ss, planId) {
  planId = String(planId || '').trim();
  if (!planId) return '';
  var sheet = ss.getSheetByName('shipments');
  if (!sheet) return '';
  var s = shipmentReadSheet_(sheet);
  var idCol = s.col('shipment_id');
  var refCols = ['shipping_plan_id', 'source_shipping_plan_id', 'plan_id']
    .map(function (n) { return s.col(n); }).filter(function (c) { return c !== -1; });
  if (!refCols.length) return '';
  for (var r = 1; r < s.rows.length; r++) {
    for (var c = 0; c < refCols.length; c++) {
      if (String(s.rows[r][refCols[c]]).trim() === planId) {
        return idCol !== -1 ? String(s.rows[r][idCol]).trim() : 'MATCH';
      }
    }
  }
  return '';
}

/**
 * Validate the carton-number ranges (carton_no_start / carton_no_end) for a shipment's lines.
 * Rules: integers only; start <= end; ranges must not overlap within the same shipment.
 * When requireComplete is true, EVERY line must have both start and end (Ship gate).
 * Returns { ok, error }.
 */
function shipmentValidateCartons_(ss, shipmentId, requireComplete) {
  var sheet = ss.getSheetByName('shipment_lines');
  if (!sheet) return { ok: true };
  var s = shipmentReadSheet_(sheet);
  var idCol = s.col('shipment_id');
  var startCol = s.col('carton_no_start');
  var endCol = s.col('carton_no_end');
  var skuCol = s.col('sku');
  if (idCol === -1) return { ok: true };
  var ranges = [];
  for (var r = 1; r < s.rows.length; r++) {
    if (String(s.rows[r][idCol]).trim() !== String(shipmentId).trim()) continue;
    var sku = skuCol !== -1 ? String(s.rows[r][skuCol] || '').trim() : ('line ' + r);
    var rawStart = startCol !== -1 ? String(s.rows[r][startCol] == null ? '' : s.rows[r][startCol]).trim() : '';
    var rawEnd = endCol !== -1 ? String(s.rows[r][endCol] == null ? '' : s.rows[r][endCol]).trim() : '';
    if (rawStart === '' && rawEnd === '') {
      if (requireComplete) return { ok: false, error: 'Carton No. required for SKU ' + sku };
      continue;
    }
    if (rawStart === '' || rawEnd === '') {
      return { ok: false, error: 'Both Carton No. Start and End are required for SKU ' + sku };
    }
    var st = parseInt(rawStart, 10), en = parseInt(rawEnd, 10);
    if (isNaN(st) || isNaN(en) || String(st) !== rawStart || String(en) !== rawEnd) {
      return { ok: false, error: 'Carton No. must be whole numbers for SKU ' + sku };
    }
    if (st > en) return { ok: false, error: 'Carton No. Start must be <= End for SKU ' + sku };
    ranges.push({ sku: sku, start: st, end: en });
  }
  for (var i = 0; i < ranges.length; i++) {
    for (var j = i + 1; j < ranges.length; j++) {
      if (ranges[i].start <= ranges[j].end && ranges[j].start <= ranges[i].end) {
        return { ok: false, error: 'Carton No. ranges overlap: ' + ranges[i].sku + ' (' + ranges[i].start + '-' + ranges[i].end + ') and ' + ranges[j].sku + ' (' + ranges[j].start + '-' + ranges[j].end + ')' };
      }
    }
  }
  return { ok: true };
}

/**
 * Shipment EXACT rate-card resolution + Phase-1 Estimated Cost. ctx carries the plan carrier + route +
 * measures + lines. Returns { rateCardId, rateReview, currency, estimated* }.
 *   - No carrier chosen (e.g. overseas → FBA, no rate system) → Not Applied: everything blank, rateReview=false.
 *   - Carrier chosen but NO exact candidate → rateReview=true, estimated_* blank, rate_card_id blank
 *     (the carrier is NEVER silently switched; the shipment must be resolved before Approve/Ship).
 *   - Exact candidate found → prefer the plan's own rate_card_id if still valid, else the newest candidate;
 *     compute Freight(+fuel) + Customs Fee(once) + Duty(series; included→0 / excluded→calc / blank→'') and
 *     estimated_unit_cost = total / total_qty (blank when qty 0). Uses shared engine helpers (17_). Never throws.
 */
function shipmentExactRateAndCost_(ss, ctx) {
  var out = { rateCardId: '', rateReview: false, splitRequired: false, currency: '',
    estimatedFreightCost: '', estimatedDuty: '', estimatedCustomsFee: '', estimatedTotalCost: '', estimatedUnitCost: '' };
  try {
    var carrierId = String(ctx.carrierId || '').trim();
    if (!carrierId) return out;   // no carrier → Not Applied (blank; not a Rate Review failure)
    if (typeof shippingMatchRateCards_ !== 'function') return out;   // engine not present → Not Applied
    var battery = shippingBatteryClass_(ss, (ctx.lines || []).map(function (l) { return l.sku; }));
    var isMulti = String(ctx.marketplace || '').trim().toUpperCase() === 'MULTI';
    var candidates = shippingMatchRateCards_(ss, {
      originCountry: '', destinationCountry: ctx.country, shippingMethod: ctx.shippingMethod,
      lastMile: ctx.lastMile, batteryType: battery, quoteDate: ctx.quoteDate,
      marketplace: isMulti ? 'MULTI' : ctx.marketplace,
      destinationWarehouseCode: ctx.destinationWarehouseCode
    }, true).filter(function (rc) { return String(rc.carrier_id || '').trim() === carrierId; });
    // Combined (MULTI) shipment: a SINGLE rate card must apply to the WHOLE shipment — accept ONLY a card
    // with a BLANK marketplace (applies to all). If only per-marketplace cards exist → SPLIT SHIPMENT
    // required (never average/merge multiple marketplace cards into one quote).
    if (isMulti) {
      var whole = candidates.filter(function (c) { return String(c.marketplace || '').trim() === ''; });
      if (whole.length) { candidates = whole; }
      else if (candidates.length) { out.splitRequired = true; out.rateReview = true; return out; }
    }
    var rc = null;
    if (ctx.planRateCardId) rc = candidates.filter(function (c) { return String(c.rate_card_id || '').trim() === String(ctx.planRateCardId).trim(); })[0] || null;
    if (!rc) rc = candidates[0] || null;
    if (!rc) { out.rateReview = true; return out; }   // no exact match → Rate Review (no silent switch)
    var freight = shippingFreight_(rc, { grossWeightKg: ctx.grossWeightKg, cbm: ctx.cbm, cartons: ctx.cartons });
    var customsFee = shippingCustomsFee_(rc);
    var treat = String(ctx.importDutyTreatment || rc.import_duty_treatment || '').trim();
    var duty = shippingDuty_(ss, ctx.lines, treat, ctx.country, ctx.quoteDate);
    var total = freight.freight + customsFee + (duty === '' ? 0 : duty);
    out.rateCardId = String(rc.rate_card_id || '').trim();
    out.currency = String(rc.currency || '').trim();
    out.estimatedFreightCost = freight.freight;
    out.estimatedDuty = duty;
    out.estimatedCustomsFee = customsFee;
    out.estimatedTotalCost = Math.round(total * 100) / 100;
    out.estimatedUnitCost = (shipmentNum_(ctx.totalQty) > 0) ? Math.round((total / shipmentNum_(ctx.totalQty)) * 10000) / 10000 : '';
    return out;
  } catch (e) { out.rateReview = true; return out; }
}

// F1-7N-FC-1A §J DEPLOYMENT STAMP, INTRODUCED HERE BECAUSE THIS FILE'S ABSENCE IS SILENT.
//
// A 12_ one round behind answers every action it owns, so no action list and no handler probe can see it. What
// it does differently is create a Shipment Draft that reserves NOTHING: the units stay fully available, a
// second site plans the same physical stock, and the collision reappears at Confirm exactly as it did before
// this round — while the site believes reservation is live. That is the partial-sync failure a declared
// build is the only way to name. Registered in 63_'s module manifest.
var SHIPMENT_BUILD_VERSION_ = 'F1-7N-FC-1A';

// ---- Execution Commit: Approved shipping_plan → shipments + shipment_lines (draft) ----

/**
 * Creates the Shipment Draft for an APPROVED shipping_plan. Idempotent: if a shipment already
 * exists for the plan, it is returned without creating a duplicate. Copies the plan header context
 * and copies each line's Decision Snapshot into the Execution Snapshot (no recalculation).
 * Returns { created, shipment_id, shipment_no, line_count, reason }.
 */
function createShipmentFromApprovedPlan_(ss, planId, actor) {
  planId = String(planId || '').trim();
  if (!planId) return { created: false, reason: 'missing_plan_id' };
  actor = String(actor || 'system_user').trim();

  var planSheet = ss.getSheetByName('shipping_plans');
  var planLineSheet = ss.getSheetByName('shipping_plan_lines');
  if (!planSheet) return { created: false, reason: 'shipping_plans_not_found' };
  if (!planLineSheet) return { created: false, reason: 'shipping_plan_lines_not_found' };

  // Locate the plan row.
  var p = shipmentReadSheet_(planSheet);
  var pIdCol = p.col('shipping_plan_id');
  if (pIdCol === -1) return { created: false, reason: 'plan_id_column_missing' };
  var planRow = null, planRowIndex = -1;
  for (var i = 1; i < p.rows.length; i++) {
    if (String(p.rows[i][pIdCol]).trim() === planId) { planRow = p.rows[i]; planRowIndex = i + 1; break; }
  }
  if (!planRow) return { created: false, reason: 'plan_not_found' };
  var pv = function (name) { var c = p.col(name); return c === -1 ? '' : planRow[c]; };
  if (String(pv('status')).trim() !== 'approved') {
    return { created: false, reason: 'plan_not_approved' };
  }
  // Combined-Plan guard: a CHILD (parent_shipping_plan_id points at a Combined Parent) is NEVER transferred
  // on its own — the Combined Parent is the transfer unit (§七). Prevents duplicate Shipments from a Parent
  // + its Children.
  var planParentRef = String(pv('parent_shipping_plan_id') || '').trim();
  if (planParentRef && planParentRef !== planId) {
    return { created: false, reason: 'is_combined_child', parent_shipping_plan_id: planParentRef };
  }

  var shipmentSheet = shipmentEnsureSheet_(ss, 'shipments', SHIPMENTS_HEADERS_);
  var shipmentLineSheet = shipmentEnsureSheet_(ss, 'shipment_lines', SHIPMENT_LINES_HEADERS_);
  // Auto-add columns on tabs that predate them (no manual migration). Includes the CANONICAL renamed
  // quantity totals + shipments_customs_type snapshot so appendByHeader can write them. Retired legacy columns
  // (total_qty / total_cartons / total_cbm / carton_qty) are intentionally NOT ensured here.
  sheetEnsureColumns_(shipmentSheet, ['external_shipment_id', 'shipped_at', 'shipped_by', 'hidden_from_draft_at', 'hidden_from_draft_by',
    'last_mile_delivery', 'shipments_customs_type', 'booking_no', 'note',
    'shipment_total_qty', 'shipment_total_cartons', 'shipment_total_cbm',
    'shipment_total_gross_weight', 'shipment_total_net_weight',
    // CANONICAL 2026-07-28 columns (additive; no reorder / shift / dup).
    'source_warehouse_id', 'destination_warehouse_id', 'destination_type', 'import_duty_treatment',
    'master_tracking_number', 'is_cross_dock', 'temperature_requirement', 'hazmat_flag',
    'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'estimated_unit_cost',
    'total_cost_actual']);
  sheetEnsureColumns_(shipmentLineSheet, ['carton_no_start', 'carton_no_end', 'shipment_carton_qty', 'shipment_qty', 'shipment_carton_cbm', 'shipping_plan_line_id']);
  sheetEnsureColumns_(planSheet, ['transferred_to_shipment_at', 'transferred_shipment_id']);

  // ---- F1-7N-FC-1A §E — THE LOCK. -------------------------------------------------------------------
  // Everything from the idempotency scan to the last write now runs under ONE ScriptLock. Two things need it:
  // the duplicate-shipment check (an unlocked scan lets two concurrent Approves both find "none" and both
  // create one), and the factory-stock reservation, which by definition cannot be evaluated against a balance
  // another writer is moving. Neither caller holds a lock (11_'s status transition and the explicit
  // createShipmentFromPlan retry), so it is taken here, and released on EVERY exit path below.
  var fcLock = null;
  try { fcLock = LockService.getScriptLock(); if (!fcLock.tryLock(30000)) return { created: false, reason: 'LOCK_UNAVAILABLE' }; }
  catch (eLock) { return { created: false, reason: 'LOCK_ERROR', error: String(eLock && eLock.message ? eLock.message : eLock) }; }
  function fcUnlock_() { try { if (fcLock) fcLock.releaseLock(); } catch (e) {} }
  // Every write from here on is journaled in the SAME {kind:'cell'|'row'} shape 21_ uses, so the shipment
  // rows, the plan handoff cells and the reservation all unwind through ONE compensation path.
  var fcJournal = [];
  function fcJournalRow_(sheet) { fcJournal.push({ kind: 'row', sheet: sheet, row: sheet.getLastRow() }); }

  // Idempotency: one Shipment Draft per approved plan (Phase 1). Skip if one already exists.
  var s = shipmentReadSheet_(shipmentSheet);
  var sPlanCol = s.col('shipping_plan_id');
  var sIdCol = s.col('shipment_id');
  if (sPlanCol !== -1) {
    for (var r = 1; r < s.rows.length; r++) {
      if (String(s.rows[r][sPlanCol]).trim() === planId) {
        fcUnlock_();
        return { created: false, reason: 'already_exists', shipment_id: (sIdCol !== -1 ? String(s.rows[r][sIdCol]).trim() : '') };
      }
    }
  }

  // Collect the plan's EFFECTIVE lines. A Combined Parent owns NO lines directly — its effective lines are
  // the UNION of its children's lines (shippingPlanEffectiveOwnerIds_, 11_). A normal plan → its own lines.
  // Never reads both Parent-direct + child lines (no double count).
  var ownerIds = {};
  (typeof shippingPlanEffectiveOwnerIds_ === 'function' ? shippingPlanEffectiveOwnerIds_(ss, planId) : [planId]).forEach(function (x) { ownerIds[String(x).trim()] = 1; });
  var pl = shipmentReadSheet_(planLineSheet);
  var plPlanCol = pl.col('shipping_plan_id');
  var planLines = [];
  for (var k = 1; k < pl.rows.length; k++) {
    if (plPlanCol !== -1 && ownerIds[String(pl.rows[k][plPlanCol]).trim()]) planLines.push(pl.rows[k]);
  }
  var plv = function (rowVals, name) { var c = pl.col(name); return c === -1 ? '' : rowVals[c]; };
  // Plan carton qty — CANONICAL shipping_plan_lines.plan_carton_qty with legacy carton_qty read-fallback.
  var planCartonQty = function (rowVals) {
    var v = plv(rowVals, 'plan_carton_qty');
    if (v === '' || v == null) v = plv(rowVals, 'carton_qty');
    return v;
  };

  // ---- F1-7N-FC-1A §E — FACTORY STOCK SUFFICIENCY, VALIDATED BEFORE ANY WRITE. -----------------------
  // The frozen model (§0) reserves at Shipment Draft creation and nowhere earlier, so THIS is the first
  // moment the system commits to physical units and therefore the first moment a two-site collision can be
  // refused. Refusing here writes nothing at all: no shipment, no lines, no reservation, and the approved plan
  // stays recoverable so the operator can retry after the competing shipment releases or dispatches.
  var srcWarehouseId = String(pv('source_warehouse_id') || '').trim();
  var needBySku = {}, needSkus = [];
  for (var nq = 0; nq < planLines.length; nq++) {
    var nSku = String(plv(planLines[nq], 'sku') || '').trim();
    var nQty = Math.round(shipmentNum_(plv(planLines[nq], 'approved_qty')));
    if (!nSku || nQty <= 0) continue;
    if (needBySku[nSku] === undefined) { needBySku[nSku] = 0; needSkus.push(nSku); }
    needBySku[nSku] += nQty;
  }
  var fcStockSheet = ss.getSheetByName('factory_stock');
  var FC_MOV_HEADERS_ = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty',
    'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
    'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
  var fcMovSheet = null;
  if (needSkus.length) {
    // A plan with units to ship and no source warehouse cannot reserve anything, and reserving against a
    // guessed warehouse would be worse than refusing. Fail closed and name the missing field.
    if (!srcWarehouseId) { fcUnlock_(); return { created: false, reason: 'SOURCE_WAREHOUSE_REQUIRED_FOR_RESERVATION', shipping_plan_id: planId }; }
    if (!fcStockSheet) { fcUnlock_(); return { created: false, reason: 'factory_stock_not_found' }; }
    fcMovSheet = fcWriteEnsureSheet_(ss, 'factory_stock_movements', FC_MOV_HEADERS_);
    fcWriteEnsureColumns_(fcMovSheet, FC_MOV_HEADERS_);
    var shortfalls = [];
    for (var ns = 0; ns < needSkus.length; ns++) {
      var bal = factoryStockReadBalanceTx_(fcStockSheet, srcWarehouseId, needSkus[ns]);
      if (bal.available < needBySku[needSkus[ns]]) {
        shortfalls.push({ sku: needSkus[ns], warehouse_id: srcWarehouseId, need: needBySku[needSkus[ns]],
          available: bal.available, current: bal.current, reserved: bal.reserved });
      }
    }
    if (shortfalls.length) {
      fcUnlock_();
      return { created: false, reason: 'INSUFFICIENT_FACTORY_STOCK', shipping_plan_id: planId,
        source_warehouse_id: srcWarehouseId, shortfalls: shortfalls,
        message: 'Insufficient available factory stock at ' + srcWarehouseId + ' for: ' + shortfalls.map(function (x) {
          return x.sku + ' (need ' + x.need + ', available ' + x.available + ')'; }).join('; ') +
          '. No Shipment Draft was created and nothing was reserved.' };
    }
  }

  var now = shipmentTimestamp_();
  var today = shipmentToday_();
  var shipmentId = 'SH-' + Utilities.getUuid().substring(0, 10).toUpperCase();
  var shipmentNo = 'SHP-' + today.replace(/-/g, '') + '-' + shipmentId.substring(3, 7);

  // Default external shipment id: COMPANY-MKT-YYMMDD-## (user-overridable later).
  //   Company abbrev = company uppercased, non-alphanumerics removed (e.g. "Res US" -> "RESUS").
  //   Marketplace abbrev = known short code (Amazon->AMZ, Walmart->WMT, ...) else first 3 chars.
  //   YYMMDD = today; ## = 2-digit serial per company+marketplace+country that day.
  function normSeg_(v) { return String(v == null ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9]+/g, ''); }
  var companyAbbrev = normSeg_(pv('company'));
  var marketplaceAbbrev = shipmentMarketplaceAbbrev_(pv('marketplace'));
  var yymmdd = today.replace(/-/g, '').substring(2); // YYYYMMDD -> YYMMDD
  var extPrefix = [companyAbbrev, marketplaceAbbrev, yymmdd].filter(String).join('-');
  var extCol = s.col('external_shipment_id');
  var extSerial = 1;
  if (extCol !== -1) {
    for (var e = 1; e < s.rows.length; e++) {
      if (String(s.rows[e][extCol] || '').indexOf(extPrefix + '-') === 0) extSerial++;
    }
  }
  var externalShipmentId = extPrefix + '-' + ('0' + extSerial).slice(-2);

  // sku -> logistics (for per-carton CBM fallback when the plan line has none).
  var logisticsMap = (typeof shippingPlanSkuLogisticsMap_ === 'function') ? shippingPlanSkuLogisticsMap_(ss) : {};
  // PER-CARTON CBM (L×W×H/1e6) — plan carton_cbm, else computed from sku_details carton dims (cm only).
  function cartonCbmFor_(rowVals) {
    var v = plv(rowVals, 'carton_cbm');
    if (v !== '' && v != null) return shipmentNum_(v);
    var sku = String(plv(rowVals, 'sku') || '').trim();
    var logi = logisticsMap[sku];
    if (!logi) return '';
    var unit = logi.cartonDimUnit || 'cm';
    if (unit !== 'cm' && unit !== '') return '';
    var cbm = (logi.cartonL * logi.cartonW * logi.cartonH) / 1000000;
    return Math.round(cbm * 1000000) / 1000000;
  }
  // LINE-TOTAL CBM for shipment_lines.shipment_carton_cbm. The plan already stores a line-total under
  // `shipping_plan_lines.cbm` (= carton_qty × per-carton carton_cbm, computed once upstream) — copy it
  // directly. Fallback (plan line-total blank): per-carton × carton-qty, multiplied EXACTLY ONCE here.
  function lineCbmFor_(rowVals) {
    var lineTotal = plv(rowVals, 'cbm');
    if (lineTotal !== '' && lineTotal != null) return shipmentNum_(lineTotal);
    var perCarton = shipmentNum_(cartonCbmFor_(rowVals));
    if (!perCarton) return '';
    return Math.round(perCarton * shipmentNum_(planCartonQty(rowVals)) * 10000) / 10000;
  }

  // Totals are COPIED / summed from the plan lines (not recalculated from live inventory).
  // shipment_total_cbm = Σ(line-total CBM) — the line already holds its total; NEVER re-multiply by cartons.
  var totalQty = 0, totalCartons = 0, totalCbm = 0, totalGross = 0, totalNet = 0;
  for (var t = 0; t < planLines.length; t++) {
    totalQty += shipmentNum_(plv(planLines[t], 'approved_qty'));
    totalCartons += shipmentNum_(planCartonQty(planLines[t]));
    totalCbm += shipmentNum_(lineCbmFor_(planLines[t]));
    totalGross += shipmentNum_(plv(planLines[t], 'gross_weight'));
    totalNet += shipmentNum_(plv(planLines[t], 'net_weight'));
  }

  // Shipping method SNAPSHOT: copy the localized display label from the Carrier Rate Card at creation
  // (B). Once copied it is NOT auto-resynced (except a rate-card change while still Draft — see update).
  // Fallback = shipping_method + '_' + last_mile_delivery when no label is available (C).
  var pRateCardId = pv('rate_card_id');
  var pShipMethod = pv('shipping_method');
  var pLastMile = pv('last_mile_delivery');
  // Customs type SNAPSHOT (CODE, canonical): prefill from the plan's Carrier Rate Card at creation
  // (user-confirmable while Draft via updateShipment). Blank/nullable when no rate card / value is available.
  // NOTE (2026-07-28): the *_label snapshots are RETIRED — display text is resolved at render time from CODE.
  var pCustomsType = shipmentCustomsType_(ss, pRateCardId, pv('customs_type'));

  // import_duty_treatment SNAPSHOT copied from the plan (blank when the plan had none — never derived).
  var pImportDutyTreatment = String(pv('import_duty_treatment') || '').trim();

  // ---- Shipment EXACT rate-card match + Estimated Cost (Phase 1) ----
  // Copy the plan's carrier + method + last_mile + customs + import_duty_treatment, then resolve the EXACT
  // rate_card_id for the shipment's full route (origin=source country not modelled at plan level; match on
  // destination country + method + last_mile + battery + marketplace + destination_warehouse_code + postal).
  // No exact candidate → RATE REVIEW: rate_card_id stays blank, estimated_* blank (Not Applied), a note is
  // recorded, and the carrier is NEVER silently switched. Cost NEVER writes back to the approved plan.
  var exact = shipmentExactRateAndCost_(ss, {
    planRateCardId: pRateCardId,
    carrierId: String(pv('carrier_id') || '').trim(),
    country: pv('country'),
    marketplace: pv('marketplace'),
    shippingMethod: pShipMethod,
    lastMile: pLastMile,
    importDutyTreatment: pImportDutyTreatment,
    destinationWarehouseCode: '',   // set later by the Warehouse Picker; blank = don't constrain
    quoteDate: today,
    grossWeightKg: totalGross,
    cbm: totalCbm,
    cartons: totalCartons,
    totalQty: totalQty,
    lines: planLines.map(function (lr) { return { sku: String(plv(lr, 'sku') || '').trim(), qty: shipmentNum_(plv(lr, 'approved_qty')) }; })
  });
  var rateReviewNote = exact.splitRequired
    ? ('[RATE REVIEW — SPLIT SHIPMENT @' + now + '] Combined (MULTI-marketplace) shipment has no single carrier_rate_card that applies to the whole shipment (only per-marketplace cards exist). Split the shipment by marketplace — do NOT average/merge rate cards. Estimated Cost = Not Applied; carrier NOT auto-switched.')
    : (exact.rateReview ? ('[RATE REVIEW @' + now + '] No exact carrier_rate_card matched the shipment route — Estimated Cost = Not Applied; resolve a rate card before Approve/Ship (carrier NOT auto-switched).') : '');

  // Header: copy the six-key context + carrier from the plan (WEEKLY §12) + CANONICAL warehouse ids + cost.
  shipmentAppendByHeader_(shipmentSheet, {
    shipment_id: shipmentId,
    shipment_no: shipmentNo,
    external_shipment_id: externalShipmentId,
    shipping_plan_id: planId,
    company: pv('company'),
    country: pv('country'),
    marketplace: pv('marketplace'),   // actual Marketplace, or MULTI when the plan combined marketplaces
    ship_from: pv('ship_from'),
    source_warehouse_id: pv('source_warehouse_id'),           // out-source identity (NO origin_warehouse_id)
    destination: pv('destination'),
    destination_warehouse_id: pv('destination_warehouse_id'), // out-destination identity
    destination_type: pv('destination_type'),
    shipping_method: pShipMethod,
    last_mile_delivery: pLastMile,
    shipments_customs_type: pCustomsType,  // customs method SNAPSHOT — CODE (prefilled; editable while Draft)
    import_duty_treatment: pImportDutyTreatment,
    carrier_id: pv('carrier_id'),
    rate_card_id: exact.rateCardId || '',   // blank when Rate Review (never a silently-switched carrier)
    currency: exact.currency || pv('currency'),
    status: 'draft',
    shipment_total_qty: totalQty,
    shipment_total_cartons: totalCartons,
    shipment_total_cbm: shipmentNum_(Math.round(totalCbm * 10000) / 10000),
    shipment_total_gross_weight: shipmentNum_(Math.round(totalGross * 1000) / 1000),
    shipment_total_net_weight: shipmentNum_(Math.round(totalNet * 1000) / 1000),
    estimated_freight_cost: exact.estimatedFreightCost,
    estimated_duty: exact.estimatedDuty,
    estimated_customs_fee: exact.estimatedCustomsFee,
    estimated_total_cost: exact.estimatedTotalCost,
    estimated_unit_cost: exact.estimatedUnitCost,
    note: rateReviewNote,
    created_by: actor,
    created_at: now,
    updated_by: actor,
    updated_at: now
  });
  fcJournalRow_(shipmentSheet);

  // Lines: qty = approved_qty; copy carton/units; COPY the Decision Snapshot → Execution Snapshot.
  var lineCount = 0;
  for (var j = 0; j < planLines.length; j++) {
    var lr = planLines[j];
    shipmentAppendByHeader_(shipmentLineSheet, {
      shipment_line_id: 'SHL-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
      shipment_id: shipmentId,
      sku: plv(lr, 'sku'),
      shipment_qty: shipmentNum_(plv(lr, 'approved_qty')),
      // FROZEN receiver lineage (R6): the EXACT source shipping_plan_line for this physical line (1:1).
      // Never derived from SKU/marketplace text/FC Share; immutable once the shipment is dispatched.
      shipping_plan_line_id: plv(lr, 'shipping_plan_line_id'),
      shipment_carton_qty: shipmentNum_(planCartonQty(lr)),
      units_per_carton: shipmentNum_(plv(lr, 'units_per_carton')),
      // Logistics: COPIED from the plan line (Execution Snapshot — never recalculated).
      // shipment_carton_cbm = LINE-TOTAL CBM (plan line-total `cbm`; per-carton × cartons once as fallback).
      shipment_carton_cbm: lineCbmFor_(lr),
      gross_weight: (plv(lr, 'gross_weight') === '' || plv(lr, 'gross_weight') == null) ? '' : plv(lr, 'gross_weight'),
      net_weight: (plv(lr, 'net_weight') === '' || plv(lr, 'net_weight') == null) ? '' : plv(lr, 'net_weight'),
      note: plv(lr, 'note'),
      created_at: now,
      updated_at: now,
      // Execution Snapshot — verbatim copy of the line's Decision Snapshot (ARCHITECTURE §4A).
      snapshot_current_stock: plv(lr, 'snapshot_current_stock'),
      snapshot_avg_sales_per_day: plv(lr, 'snapshot_avg_sales_per_day'),
      snapshot_days_of_supply: plv(lr, 'snapshot_days_of_supply'),
      snapshot_suggested_qty: plv(lr, 'snapshot_suggested_qty'),
      snapshot_target_days: plv(lr, 'snapshot_target_days'),
      snapshot_fc_context: plv(lr, 'snapshot_fc_context'),
      snapshot_event_context: plv(lr, 'snapshot_event_context'),
      snapshot_avg_sales_source: plv(lr, 'snapshot_avg_sales_source'),
      snapshot_avg_sales_warning: plv(lr, 'snapshot_avg_sales_warning')
    });
    fcJournalRow_(shipmentLineSheet);
    lineCount++;
  }

  // ---- F1-7N-FC-1A §E — ACQUIRE THE RESERVATION, OR UNDO THE SHIPMENT. -------------------------------
  // The shipment row exists at this point, which is what gives the reservation a resolvable owner
  // (related_entity_type='shipment', related_entity_id=shipment_id) rather than a counter with no lineage.
  // If the acquire fails for ANY reason the whole draft is rolled back through the shared journal, so the
  // outcome is exactly the two states §E allows: a shipment WITH its reservation, or neither.
  var reservationSummary = [];
  if (needSkus.length) {
    try {
      for (var ra = 0; ra < needSkus.length; ra++) {
        var acq = factoryStockAcquireReservationTx_({
          stockSheet: fcStockSheet, movSheet: fcMovSheet, warehouseId: srcWarehouseId, sku: needSkus[ra],
          qty: needBySku[needSkus[ra]], ownerType: FSTX_RESERVATION_OWNER_TYPE_, ownerId: shipmentId,
          journal: fcJournal, now: now, movementDate: today, createdBy: actor,
          note: 'Reserved for Shipment Draft ' + shipmentId + ' (shipping plan ' + planId + ')'
        });
        reservationSummary.push({ sku: needSkus[ra], warehouse_id: srcWarehouseId,
          reserved_qty: needBySku[needSkus[ra]], applied: acq.applied, reason: acq.reason });
      }
    } catch (eRes) {
      factoryStockRollbackJournal_(fcJournal);
      fcUnlock_();
      return { created: false, reason: 'RESERVATION_FAILED', shipping_plan_id: planId,
        source_warehouse_id: srcWarehouseId,
        error: String(eRes && eRes.message ? eRes.message : eRes),
        message: 'The Shipment Draft could not reserve factory stock and was rolled back. Nothing was created ' +
          'and no stock was reserved. The approved plan remains recoverable.' };
    }
  }

  // Decision-Layer HANDOFF metadata (NOT a Decision Snapshot change — Immutable Flow preserved):
  // mark the plan as transferred so the Weekly Shipping Plan UI hides it by default. The plan row and
  // its lines (and their Decision Snapshot) are NOT deleted or mutated. setValue skips columns absent
  // from the live sheet, so this is non-blocking until the two new headers are added.
  function setPlanCell_(name, value) {
    var c = p.col(name);
    if (c === -1 || planRowIndex === -1) return;
    fcJournal.push({ kind: 'cell', sheet: planSheet, row: planRowIndex, col: c, prev: planRow[c] });
    planSheet.getRange(planRowIndex, c + 1).setValue(value);
  }
  setPlanCell_('transferred_to_shipment_at', now);
  setPlanCell_('transferred_shipment_id', shipmentId);
  setPlanCell_('updated_at', now);

  fcUnlock_();
  return { created: true, shipment_id: shipmentId, shipment_no: shipmentNo, line_count: lineCount,
    source_warehouse_id: srcWarehouseId, factory_reservations: reservationSummary };
}

/**
 * Explicit action wrapper — the IDEMPOTENT RETRY of the Execution Commit.
 *
 * F1-7N-FC-1A §C. This action has been routed, handled and adapter-wrapped since the Shipment Center work, and
 * the Approve failure message has been telling operators "You can retry from Shipment Overview" the whole time
 * — but nothing in the frontend could reach it, and Shipment Overview renders `shipped` onward, so the very
 * state needing recovery could never appear there. It is now called by the approved plan card on the Weekly
 * Shipping Plan page, which is where the recoverable plan actually is.
 *
 * The answer is deliberately a two-value outcome the caller can bind to without parsing prose:
 *   outcome = 'CREATED'  a Shipment Draft was created by this call
 *   outcome = 'REUSED'   one already existed; this call changed nothing (the safe result of a double click,
 *                        a retried transport failure, or a retry after an answer was lost in flight)
 * Anything else is a typed failure carrying its reason. A retry NEVER changes the plan's approval status: this
 * path does not touch `status`, `approved_by` or `approved_at` at all.
 */
function handleCreateShipmentFromPlan_(body) {
  var planId = String((body && body.shipping_plan_id) || '').trim();
  var actor = String((body && (body.created_by || body.actor)) || 'system_user').trim();
  if (!planId) return jsonResponse_({ success: false, error: 'Missing shipping_plan_id', code: 'MISSING_SHIPPING_PLAN_ID' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result;
  try {
    result = createShipmentFromApprovedPlan_(ss, planId, actor);
  } catch (e) {
    return jsonResponse_({ success: false, code: 'SHIPMENT_CREATION_FAILED', shipping_plan_id: planId,
      error: String(e && e.message ? e.message : e) });
  }
  if (result && result.created === false && result.reason && result.reason !== 'already_exists') {
    return jsonResponse_({ success: false, code: String(result.reason).toUpperCase(), shipping_plan_id: planId,
      error: (result.message || ('Could not create shipment: ' + result.reason)), data: result });
  }
  var reused = !!(result && result.created === false && result.reason === 'already_exists');
  return jsonResponse_({ success: true, data: Object.assign({}, result, {
    outcome: reused ? 'REUSED' : 'CREATED',
    shipping_plan_id: planId,
    approval_status_changed: false
  }) });
}

// ---- Central Shipment totals recalculation (snapshot) ----

/**
 * Recompute + persist the Shipment header snapshot totals from the shipment's OWN lines
 * (`shipment_lines`), NOT from live inventory. Canonical formulas (E):
 *   shipment_total_qty          = Σ shipment_lines.shipment_qty      (legacy `qty` read-fallback)
 *   shipment_total_cartons      = Σ shipment_lines.shipment_carton_qty (legacy `carton_qty` fallback)
 *   shipment_total_cbm          = Σ shipment_lines.shipment_carton_cbm — LINE-TOTAL summed DIRECTLY (no × cartons)
 *   shipment_total_gross_weight = Σ shipment_lines.gross_weight
 *   shipment_total_net_weight   = Σ shipment_lines.net_weight
 * shipment_carton_cbm / gross_weight / net_weight are LINE TOTALS read AS STORED and summed directly.
 * Legacy per-carton `carton_cbm` (old writer) is converted ONCE (× shipment_carton_qty) for historical
 * rows only — a compatibility read, never a rewrite. Additive column ensure; never re-creates retired
 * legacy total columns. Missing tab/row/column safe (no-op).
 */
function shipmentRecalcTotals_(ss, shipmentId) {
  var lineSheet = ss.getSheetByName('shipment_lines');
  var shipSheet = ss.getSheetByName('shipments');
  if (!lineSheet || !shipSheet) return;
  var ls = shipmentReadSheet_(lineSheet);
  var lIdCol = ls.col('shipment_id');
  if (lIdCol === -1) return;
  var qtyCol = ls.col('shipment_qty'), qtyLegacyCol = ls.col('qty');
  var ctnCol = ls.col('shipment_carton_qty'), ctnLegacyCol = ls.col('carton_qty');
  var cbmCol = ls.col('shipment_carton_cbm'), cbmLegacyCol = ls.col('carton_cbm');
  var grossCol = ls.col('gross_weight'), netCol = ls.col('net_weight');
  function fallbackNum_(row, primaryCol, legacyCol) {
    var v = (primaryCol !== -1) ? row[primaryCol] : '';
    if ((v === '' || v == null) && legacyCol !== -1) v = row[legacyCol];   // legacy read-fallback (old rows)
    return shipmentNum_(v);
  }
  var tQty = 0, tCtn = 0, tCbm = 0, tGross = 0, tNet = 0;
  for (var i = 1; i < ls.rows.length; i++) {
    if (String(ls.rows[i][lIdCol]).trim() !== String(shipmentId).trim()) continue;
    var ctn = fallbackNum_(ls.rows[i], ctnCol, ctnLegacyCol);
    tQty += fallbackNum_(ls.rows[i], qtyCol, qtyLegacyCol);
    tCtn += ctn;
    // Canonical shipment_carton_cbm = LINE-TOTAL → sum directly. If only the legacy per-carton
    // carton_cbm exists (historical row), convert ONCE (× cartons) — never treat per-carton as a total.
    var cbmVal = (cbmCol !== -1) ? ls.rows[i][cbmCol] : '';
    if (cbmVal === '' || cbmVal == null) cbmVal = shipmentNum_(cbmLegacyCol === -1 ? 0 : ls.rows[i][cbmLegacyCol]) * ctn;
    tCbm += shipmentNum_(cbmVal);
    tGross += shipmentNum_(grossCol === -1 ? 0 : ls.rows[i][grossCol]);
    tNet += shipmentNum_(netCol === -1 ? 0 : ls.rows[i][netCol]);
  }
  sheetEnsureColumns_(shipSheet, ['shipment_total_qty', 'shipment_total_cartons', 'shipment_total_cbm',
    'shipment_total_gross_weight', 'shipment_total_net_weight']);
  var sh = shipmentReadSheet_(shipSheet);   // re-read AFTER ensure so new column indices resolve
  var idCol = sh.col('shipment_id');
  if (idCol === -1) return;
  var row = -1;
  for (var r = 1; r < sh.rows.length; r++) {
    if (String(sh.rows[r][idCol]).trim() === String(shipmentId).trim()) { row = r + 1; break; }
  }
  if (row === -1) return;
  function setTotal_(name, val) { var c = sh.col(name); if (c !== -1) shipSheet.getRange(row, c + 1).setValue(val); }
  setTotal_('shipment_total_qty', tQty);
  setTotal_('shipment_total_cartons', tCtn);
  setTotal_('shipment_total_cbm', shipmentNum_(Math.round(tCbm * 10000) / 10000));
  setTotal_('shipment_total_gross_weight', shipmentNum_(Math.round(tGross * 1000) / 1000));
  setTotal_('shipment_total_net_weight', shipmentNum_(Math.round(tNet * 1000) / 1000));
}

// ---- updateShipment: edit EXECUTION-layer fields only ----

/**
 * Edit execution-layer fields on a shipment (header-based row lookup by shipment_id).
 * Only fields in SHIPMENT_EDITABLE_FIELDS_ (+ status) are writable; the Execution Snapshot
 * and the six-key context can NEVER be modified here. Body:
 *   { shipment_id, <editable field>: value, ..., status?, actor? }
 */
function handleUpdateShipment_(body) {
  var shipmentId = String((body && body.shipment_id) || '').trim();
  var actor = String((body && (body.updated_by || body.actor)) || 'system_user').trim();
  if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('shipments');
  if (!sheet) return jsonResponse_({ success: false, error: 'shipments sheet not found' });

  // Auto-add columns on tabs that predate them.
  sheetEnsureColumns_(sheet, ['external_shipment_id', 'shipped_at', 'shipped_by', 'hidden_from_draft_at', 'hidden_from_draft_by',
    'last_mile_delivery', 'shipments_customs_type', 'booking_no', 'note',
    'shipment_total_gross_weight', 'shipment_total_net_weight',
    // CANONICAL 2026-07-28 editable columns.
    'source_warehouse_id', 'destination_warehouse_id', 'destination_type', 'import_duty_treatment',
    'master_tracking_number', 'is_cross_dock', 'temperature_requirement', 'hazmat_flag', 'total_cost_actual']);

  var s = shipmentReadSheet_(sheet);
  var idCol = s.col('shipment_id');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipment_id column not found' });

  var targetRow = -1;
  for (var i = 1; i < s.rows.length; i++) {
    if (String(s.rows[i][idCol]).trim() === shipmentId) { targetRow = i + 1; break; }
  }
  if (targetRow === -1) return jsonResponse_({ success: false, error: 'Shipment not found: ' + shipmentId });

  var rowVals = s.rows[targetRow - 1] || [];
  function setCell(name, value) { var c = s.col(name); if (c !== -1) sheet.getRange(targetRow, c + 1).setValue(value); }
  // Merged value = body override if present, else the current row value.
  function mv(name) {
    if (body.hasOwnProperty(name) && String(body[name]).trim() !== '') return String(body[name]).trim();
    var c = s.col(name); return c === -1 ? '' : String(rowVals[c] == null ? '' : rowVals[c]).trim();
  }
  function mnum(name) { var v = parseFloat(mv(name)); return isNaN(v) ? 0 : v; }

  var newStatus = (body.hasOwnProperty('status') && String(body.status).trim() !== '') ? String(body.status).trim() : '';
  var curStatus = (function () { var c = s.col('status'); return c === -1 ? '' : String(rowVals[c] || '').trim(); })();

  var now = shipmentTimestamp_();

  // ---- F1-7N-FC-1A §E — A SOURCE-WAREHOUSE CHANGE MOVES THE RESERVATION, OR IS REFUSED. ------------
  //
  // §E said to adjust the reservation by the exact delta when a Shipment Draft's quantity or source changes
  // before dispatch. Those two are NOT symmetric in this system, and the measurement matters:
  //
  //   QUANTITY  shipment_lines.shipment_qty is the immutable Execution Snapshot. It is absent from
  //             SHIPMENT_EDITABLE_FIELDS_ and no action writes it after creation, so the quantity branch is
  //             VACUOUS BY DESIGN rather than unimplemented. A test pins that immutability, because the day it
  //             becomes editable the reservation silently stops matching the shipment.
  //   SOURCE    source_warehouse_id IS editable, and that is a real hole: moving the source while the
  //             reservation sits on the OLD warehouse leaves units reserved where nothing will ship from and
  //             unreserved where something will. So the edit now MOVES the reservation, under one lock:
  //             validate availability at the NEW warehouse first (refusing writes nothing at all), then
  //             release at the old and acquire at the new. Release is scoped to THIS shipment's own ledger, so
  //             it can never release another shipment's hold.
  var srcCol_ = s.col('source_warehouse_id');
  var curSrc_ = srcCol_ === -1 ? '' : String(rowVals[srcCol_] == null ? '' : rowVals[srcCol_]).trim();
  var wantSrc_ = body.hasOwnProperty('source_warehouse_id') ? String(body.source_warehouse_id == null ? '' : body.source_warehouse_id).trim() : null;
  var reservationMoved_ = null;
  if (wantSrc_ !== null && wantSrc_ !== curSrc_) {
    var stkSheet_ = ss.getSheetByName('factory_stock');
    var movSheet_ = ss.getSheetByName('factory_stock_movements');
    var held_ = (stkSheet_ && movSheet_) ? factoryStockOwnerReservedTx_(movSheet_, FSTX_RESERVATION_OWNER_TYPE_, shipmentId) : {};
    var moveList_ = [];
    for (var hk_ in held_) {
      if (!Object.prototype.hasOwnProperty.call(held_, hk_)) continue;
      var parts_ = hk_.split('||');
      if (parts_[0] !== curSrc_) continue;
      var q_ = Math.round(held_[hk_] || 0);
      if (q_ > 0) moveList_.push({ sku: parts_[1], qty: q_ });
    }
    if (moveList_.length) {
      if (!wantSrc_) {
        return jsonResponse_({ success: false, code: 'SOURCE_WAREHOUSE_REQUIRED_FOR_RESERVATION', shipment_id: shipmentId,
          error: 'This Shipment Draft holds a factory stock reservation at ' + curSrc_ + ', so its source warehouse ' +
            'cannot be cleared. Nothing was changed.' });
      }
      var lockU_ = null;
      try { lockU_ = LockService.getScriptLock(); if (!lockU_.tryLock(30000)) return jsonResponse_({ success: false, code: 'LOCK_UNAVAILABLE', error: 'Could not acquire lock; please retry.' }); }
      catch (eLU_) { return jsonResponse_({ success: false, code: 'LOCK_ERROR', error: String(eLU_ && eLU_.message ? eLU_.message : eLU_) }); }
      // Availability at the NEW warehouse is validated for EVERY sku before the first write, so a refusal
      // leaves both warehouses byte-identical instead of half-moved.
      var shortNew_ = [];
      for (var mv_ = 0; mv_ < moveList_.length; mv_++) {
        var balNew_ = factoryStockReadBalanceTx_(stkSheet_, wantSrc_, moveList_[mv_].sku);
        if (balNew_.available < moveList_[mv_].qty) {
          shortNew_.push({ sku: moveList_[mv_].sku, warehouse_id: wantSrc_, need: moveList_[mv_].qty,
            available: balNew_.available, current: balNew_.current, reserved: balNew_.reserved });
        }
      }
      if (shortNew_.length) {
        try { lockU_.releaseLock(); } catch (e) {}
        return jsonResponse_({ success: false, code: 'INSUFFICIENT_FACTORY_STOCK_AT_NEW_SOURCE', shipment_id: shipmentId,
          data: { from_warehouse_id: curSrc_, to_warehouse_id: wantSrc_, shortfalls: shortNew_ },
          error: 'Cannot move this Shipment Draft to ' + wantSrc_ + ': insufficient available factory stock for ' +
            shortNew_.map(function (x) { return x.sku + ' (need ' + x.need + ', available ' + x.available + ')'; }).join('; ') +
            '. The source warehouse was NOT changed and the existing reservation at ' + curSrc_ + ' is untouched.' });
      }
      var jU_ = [];
      try {
        for (var mw_ = 0; mw_ < moveList_.length; mw_++) {
          factoryStockReleaseReservationTx_({
            stockSheet: stkSheet_, movSheet: movSheet_, warehouseId: curSrc_, sku: moveList_[mw_].sku,
            qty: moveList_[mw_].qty, ownerType: FSTX_RESERVATION_OWNER_TYPE_, ownerId: shipmentId,
            journal: jU_, now: now, createdBy: actor, releaseReason: 'source_warehouse_changed_to_' + wantSrc_
          });
          factoryStockAcquireReservationTx_({
            stockSheet: stkSheet_, movSheet: movSheet_, warehouseId: wantSrc_, sku: moveList_[mw_].sku,
            qty: moveList_[mw_].qty, ownerType: FSTX_RESERVATION_OWNER_TYPE_, ownerId: shipmentId,
            journal: jU_, now: now, createdBy: actor,
            note: 'Reservation moved from ' + curSrc_ + ' for shipment ' + shipmentId
          });
        }
      } catch (eMv_) {
        factoryStockRollbackJournal_(jU_);
        try { lockU_.releaseLock(); } catch (e) {}
        return jsonResponse_({ success: false, code: 'RESERVATION_MOVE_FAILED', shipment_id: shipmentId,
          error: 'The source warehouse change was rolled back: ' + String(eMv_ && eMv_.message ? eMv_.message : eMv_) +
            '. Nothing was changed.' });
      }
      try { lockU_.releaseLock(); } catch (e) {}
      reservationMoved_ = { from_warehouse_id: curSrc_, to_warehouse_id: wantSrc_, moved: moveList_ };
    }
  }

  // Write editable fields FIRST so the Ship gate below validates the just-saved carton numbers.
  var changed = 0;
  for (var f = 0; f < SHIPMENT_EDITABLE_FIELDS_.length; f++) {
    var fld = SHIPMENT_EDITABLE_FIELDS_[f];
    if (body.hasOwnProperty(fld)) { setCell(fld, body[fld]); changed++; }
  }
  // Legacy write-compat: the existing Warehouse Picker sends warehouse_id (the DESTINATION identity).
  // Mirror it onto the canonical destination_warehouse_id when the canonical key was not sent, so the new
  // column is populated without editing the picker UI. warehouse_code stays the DESTINATION code snapshot.
  if (body.hasOwnProperty('warehouse_id') && !body.hasOwnProperty('destination_warehouse_id')) {
    setCell('destination_warehouse_id', body.warehouse_id);
  }

  // NOTE (2026-07-28 Canonical Decision): the shipping_method_label / shipments_customs_type_label
  // snapshot re-sync blocks were REMOVED — those columns are retired. Only the CODE fields
  // (shipping_method / last_mile_delivery / shipments_customs_type) are persisted; display text is
  // resolved at render time from the Code.

  // Optional: update editable shipment_line fields (carton_no_start / carton_no_end — numeric).
  var linesUpdated = 0;
  if (body.lines && body.lines.length) {
    var lineSheet0 = ss.getSheetByName('shipment_lines');
    if (lineSheet0) {
      sheetEnsureColumns_(lineSheet0, ['carton_no_start', 'carton_no_end']);
      var ls0 = shipmentReadSheet_(lineSheet0);
      var lIdCol0 = ls0.col('shipment_line_id');
      var lStartCol0 = ls0.col('carton_no_start');
      var lEndCol0 = ls0.col('carton_no_end');
      var lUpdCol0 = ls0.col('updated_at');
      if (lIdCol0 !== -1) {
        var rowByLineId0 = {};
        for (var q = 1; q < ls0.rows.length; q++) rowByLineId0[String(ls0.rows[q][lIdCol0]).trim()] = q + 1;
        for (var b = 0; b < body.lines.length; b++) {
          var bl = body.lines[b] || {};
          var lid = String(bl.shipment_line_id || '').trim();
          var rowIdx = rowByLineId0[lid];
          if (!rowIdx) continue;
          function numOrBlank_(v) { if (v === '' || v == null) return ''; var n = parseInt(v, 10); return isNaN(n) ? '' : n; }
          if (bl.hasOwnProperty('carton_no_start') && lStartCol0 !== -1) lineSheet0.getRange(rowIdx, lStartCol0 + 1).setValue(numOrBlank_(bl.carton_no_start));
          if (bl.hasOwnProperty('carton_no_end') && lEndCol0 !== -1) lineSheet0.getRange(rowIdx, lEndCol0 + 1).setValue(numOrBlank_(bl.carton_no_end));
          if (lUpdCol0 !== -1) lineSheet0.getRange(rowIdx, lUpdCol0 + 1).setValue(now);
          linesUpdated++;
        }
      }
    }
  }

  // Carton-number integrity (any save/advance): integers, start<=end, no overlap within the shipment.
  var cartonCheck = shipmentValidateCartons_(ss, shipmentId, false);
  if (!cartonCheck.ok) {
    return jsonResponse_({ success: false, error: cartonCheck.error });
  }

  // Ship gate: before marking a shipment `shipped`, required execution data must be complete
  // (SHIPMENT_CENTER_SPEC §5B). Required: external_shipment_id, reference_id, warehouse_code,
  // ETD, ETA + every line has a Carton No. range (integers, non-overlapping).
  if (newStatus === 'shipped' && curStatus !== 'shipped') {
    var missing = [];
    if (!mv('external_shipment_id')) missing.push('Shipment ID (external)');
    if (!mv('reference_id')) missing.push('Reference ID');
    if (!mv('warehouse_code')) missing.push('Warehouse Code');
    if (!mv('etd')) missing.push('ETD');
    if (!mv('eta')) missing.push('ETA');
    // CANONICAL shipment_total_qty with legacy total_qty read-fallback (old rows).
    if (mnum('shipment_total_qty') <= 0 && mnum('total_qty') <= 0) missing.push('Total Qty');
    if (missing.length) {
      return jsonResponse_({ success: false, error: 'Cannot Ship — missing required fields: ' + missing.join(', ') });
    }
    var shipCarton = shipmentValidateCartons_(ss, shipmentId, true);
    if (!shipCarton.ok) {
      return jsonResponse_({ success: false, error: 'Cannot Ship — ' + shipCarton.error });
    }
  }

  // Return to Draft (Phase-2 placeholder, no permissions yet): a revision reason is appended to
  // the note history (append-only) when a Ready to Ship shipment is sent back to Draft to edit.
  if (body.hasOwnProperty('revision_reason') && String(body.revision_reason).trim()) {
    var reasonText = String(body.revision_reason).trim();
    var noteC = s.col('note');
    var existingNote = noteC === -1 ? '' : String(rowVals[noteC] == null ? '' : rowVals[noteC]).trim();
    var appended = '[RETURN TO DRAFT @' + now + ' by ' + actor + '] ' + reasonText;
    setCell('note', existingNote ? (existingNote + '\n' + appended) : appended);
    changed++;
  }

  // Status advance. Snapshot stays frozen. Marking `shipped` stamps shipped_at / shipped_by once.
  if (newStatus) {
    setCell('status', newStatus);
    changed++;
    if (newStatus === 'shipped' && curStatus !== 'shipped') {
      setCell('shipped_at', now);
      setCell('shipped_by', actor);
    }
  }

  // Done (Shipment Draft workspace): hide from the Draft page. NOT a status change; NOT a delete.
  // The shipment stays fully visible in Shipment Overview.
  if (body.hasOwnProperty('hidden_from_draft') && body.hidden_from_draft) {
    setCell('hidden_from_draft_at', now);
    setCell('hidden_from_draft_by', actor);
    changed++;
  }

  setCell('updated_by', actor);
  setCell('updated_at', now);

  // Recalculate the header snapshot totals from the shipment's lines whenever any line changed
  // (B/E). A header-only edit (no line change) is left untouched so a manual actuals override sticks.
  if (linesUpdated > 0) {
    shipmentRecalcTotals_(ss, shipmentId);
  }

  return jsonResponse_({ success: true, data: { shipment_id: shipmentId, fields_updated: changed, lines_updated: linesUpdated, status: newStatus || curStatus } });
}

// ============================================================
// Migration (2026-07-28 Canonical Decision): RETIRE the display-label snapshot columns
//   shipping_plans.shipping_method_label · shipping_plans.customs_type_label ·
//   shipments.shipping_method_label · shipments.shipments_customs_type_label
// Display text is now resolved at RENDER time from the CODE fields (shipping_method / last_mile_delivery /
// customs_type / shipments_customs_type). This handler physically removes the four columns BY HEADER NAME,
// safely:
//   1. If a row's CODE cell is blank but its LABEL cell has a value, backfill the CODE ONLY via an explicit
//      1:1 label→code map (customs uses the canonical CUSTOMS_TYPE_LABELS_ inverse). shipping_method has NO
//      canonical label→code dictionary, so a blank-code+label row is reported, never guessed.
//   2. If any label maps to MULTIPLE codes, or a code cannot be safely backfilled, the column is NOT deleted
//      — it returns status = blocked_needs_review with the affected rows (operator resolves, then re-runs).
//   3. A column is deleted ONLY when every row's code is populated. Deletion is BY NAME (never a fixed index);
//      the whole column (header + data) is removed together, so remaining columns stay aligned (no shift).
// Body: { dry_run?: true }  (dry_run reports what WOULD happen without writing/deleting). Idempotent: an
// already-retired column returns already_retired. Header Repair never re-creates these (removed from every
// header constant + ensure list), so this migration is one-way and safe to re-run.
// ============================================================

// Inverse of the canonical customs label→code map (shared CUSTOMS_TYPE_LABELS_ lives in 17_carrier_handlers.gs).
// A label seen for more than one code becomes '__AMBIGUOUS__' (blocks deletion for that column).
function shipmentInvertedCustomsLabels_() {
  var inv = {};
  var src = (typeof CUSTOMS_TYPE_LABELS_ !== 'undefined') ? CUSTOMS_TYPE_LABELS_ : {};
  for (var code in src) {
    if (!src.hasOwnProperty(code)) continue;
    var lbl = String(src[code] == null ? '' : src[code]).trim();
    if (!lbl) continue;
    if (inv.hasOwnProperty(lbl) && inv[lbl] !== code) inv[lbl] = '__AMBIGUOUS__'; else inv[lbl] = code;
  }
  return inv;
}

function shipmentRetireOneLabelCol_(ss, p, dryRun) {
  var out = { table: p.table, label_col: p.labelCol, code_col: p.codeCol, status: '', backfilled: 0, affected_rows: [], deleted: false };
  var sh = ss.getSheetByName(p.table);
  if (!sh) { out.status = 'table_missing'; return out; }
  var data = sh.getDataRange().getValues();
  if (!data.length) { out.status = 'empty'; return out; }
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var lc = headers.indexOf(p.labelCol);
  if (lc === -1) { out.status = 'already_retired'; return out; }
  var cc = headers.indexOf(p.codeCol);
  for (var i = 1; i < data.length; i++) {
    var label = String(data[i][lc] == null ? '' : data[i][lc]).trim();
    var code = cc !== -1 ? String(data[i][cc] == null ? '' : data[i][cc]).trim() : '';
    if (!label || code) continue;   // no label, or code already present → nothing to backfill
    if (p.dict && Object.prototype.hasOwnProperty.call(p.dict, label)) {
      var mapped = p.dict[label];
      if (mapped === '__AMBIGUOUS__') { out.affected_rows.push({ row: i + 1, label: label, reason: 'label maps to multiple codes' }); continue; }
      if (cc !== -1 && !dryRun) sh.getRange(i + 1, cc + 1).setValue(mapped);
      out.backfilled++;
    } else {
      out.affected_rows.push({ row: i + 1, label: label, reason: 'code blank and no 1:1 label→code mapping' });
    }
  }
  if (out.affected_rows.length) { out.status = 'blocked_needs_review'; return out; }   // do NOT delete
  if (dryRun) { out.status = 'ready_to_delete'; return out; }
  sh.deleteColumn(lc + 1);   // delete BY NAME-resolved index (whole column; remaining columns stay aligned)
  out.deleted = true; out.status = 'deleted';
  return out;
}

/** Retire the four display-label columns. Body: { dry_run?: true }. */
function handleRetireShipmentLabelColumns_(body) {
  body = body || {};
  var dryRun = !!body.dry_run;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var invCustoms = shipmentInvertedCustomsLabels_();
  var plan = [
    { table: 'shipping_plans', labelCol: 'shipping_method_label', codeCol: 'shipping_method', dict: null },
    { table: 'shipping_plans', labelCol: 'customs_type_label', codeCol: 'customs_type', dict: invCustoms },
    { table: 'shipments', labelCol: 'shipping_method_label', codeCol: 'shipping_method', dict: null },
    { table: 'shipments', labelCol: 'shipments_customs_type_label', codeCol: 'shipments_customs_type', dict: invCustoms }
  ];
  var report = [];
  for (var i = 0; i < plan.length; i++) report.push(shipmentRetireOneLabelCol_(ss, plan[i], dryRun));   // re-reads each sheet per column (fresh indices after any delete)
  var blocked = report.filter(function (r) { return r.status === 'blocked_needs_review'; }).length;
  return jsonResponse_({ success: true, data: { dry_run: dryRun, blocked_columns: blocked, columns: report } });
}
