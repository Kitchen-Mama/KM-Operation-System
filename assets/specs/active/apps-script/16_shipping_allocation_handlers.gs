// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 16_shipping_allocation_handlers.gs — Inventory Replenishment second-layer
//   Recommendation / Execution Plan drafts (shipping_allocation_drafts + _lines)
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md §3.6
//   (canonical schema) + INVENTORY_TABLE_MAPPING_SPEC §11.4 + RECOMMENDATION_RUNTIME §C/§D.
//   - upsertShippingAllocationDraft        : create/update ONE draft header (idempotent by id, or by
//                                            planning_cycle+company+country+marketplace+draft_version)
//   - upsertShippingAllocationDraftLines   : UPSERT lines by allocation_draft_line_id. QUANTITY
//                                            PROTECTION (§D): recommended_* snapshot fields are written
//                                            only when provided; an Execution-Plan save that omits them
//                                            PRESERVES the immutable recommendation snapshot. planned_qty
//                                            is user-editable; a refresh/retry never resets it.
//   - submitShippingAllocationDrafts       : mark drafts submitted (submitted_by/at)
// PLANNING SCRATCHPAD: reserves/deducts NOTHING; the persisted Draft is the SSOT for the active cycle.
// Reuses procurement* helpers (procurementEnsureSheet_/procurementAppendByHeader_/procurementFindRow_/
// procurementTimestamp_/procurementNum_) from the shared global scope. Tables auto-create with the
// documented header (missing-header safe; no existing table/field altered).
// DO NOT persist uncovered_qty / coverage_status / window_label / route-display / source-display (§C).
// ============================================================

// CANONICAL SYNC (2026-07-27): headers below MATCH the manually-adjusted Live DB header exactly (name
// + order). Shipping remains DB + Spec Ready — this task syncs the SCHEMA only; it does NOT build the
// Shipping Recommendation writer, Engine A, route/rate/carrier resolution, Submit-Plan runtime, or any
// UI (those stay NOT IMPLEMENTED). The writer functions here are the existing UNWIRED scaffold; the
// live persistence path is still gated off in the adapter (returns {success:false} until an authorized
// redeploy). Line renames vs the previous code header: source_warehouse_id→recommended_source_warehouse_id ·
// source_available_qty_snapshot→source_initial_available_qty_snapshot · ship_from→selected_source_warehouse_id ·
// destination→selected_destination_warehouse_id. Added header: shipping_allocation_drafts.formula_version.
var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = [
  'allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace',
  'status', 'generation_type', 'calculation_run_id', 'formula_version', 'calculated_at',
  'source_data_as_of', 'draft_version',
  'created_by', 'created_at', 'updated_by', 'updated_at',
  'submitted_by', 'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'
];

var SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ = [
  // identity
  'allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku',
  // window
  'window_code', 'window_start_date', 'window_end_date', 'required_by_date',
  // recommendation input snapshots
  'regular_demand_snapshot', 'special_event_demand_snapshot', 'destination_stock_snapshot',
  'qualified_incoming_snapshot', 'approved_supply_snapshot', 'calculated_gap_qty',
  // system recommendation snapshot — source/destination warehouse + allocation sequence (immutable)
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
  'source_initial_available_qty_snapshot', 'source_available_before_allocation_snapshot', 'allocation_sequence',
  // system recommendation snapshot — route / carrier / cost (immutable per generation)
  'recommended_route_rule_id', 'recommended_rate_card_id', 'recommended_lead_time_id',
  'recommended_carrier_id', 'recommended_shipping_method', 'recommended_last_mile_delivery',
  'recommended_expected_arrival', 'recommended_estimated_cost', 'recommendation_reason', 'recommendation_flags',
  'recommended_qty',
  // user Execution Plan
  'planned_qty', 'selected_source_warehouse_id', 'selected_destination_warehouse_id',
  'selected_source_warehouse_code_snapshot', 'selected_destination_warehouse_code_snapshot',
  'selected_rate_card_id', 'selected_lead_time_id', 'selected_carrier_id', 'selected_shipping_method',
  'selected_last_mile_delivery', 'expected_arrival', 'units_per_carton', 'route_no',
  // status / audit
  'line_status', 'override_reason', 'note', 'created_at', 'updated_at'
];

var SAD_STATUSES_ = { draft: 1, site_confirmed: 1, submitted: 1, cancelled: 1 };
var SAD_GENERATION_TYPES_ = { scheduled: 1, manual_refresh: 1, user_created: 1 };

// The recommendation-snapshot fields — written only when the incoming line supplies them, so an
// Execution-Plan save (which omits them) never clobbers the immutable recommendation (§D). Canonical
// names (2026-07-27 sync).
var SAD_RECOMMENDATION_FIELDS_ = [
  'recommended_qty', 'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
  'source_initial_available_qty_snapshot', 'source_available_before_allocation_snapshot', 'allocation_sequence',
  'recommended_route_rule_id', 'recommended_rate_card_id', 'recommended_lead_time_id',
  'recommended_carrier_id', 'recommended_shipping_method', 'recommended_last_mile_delivery',
  'recommended_expected_arrival', 'recommended_estimated_cost', 'recommendation_reason', 'recommendation_flags',
  'regular_demand_snapshot', 'special_event_demand_snapshot', 'destination_stock_snapshot',
  'qualified_incoming_snapshot', 'approved_supply_snapshot', 'calculated_gap_qty',
  'window_code', 'window_start_date', 'window_end_date', 'required_by_date'
];

// Read-only legacy aliases accepted on the incoming shipping-draft line payload → canonical column.
// Keeps the existing (not-yet-migrated, still gated) Inventory Replenishment caller working without
// editing it; new writes always use the canonical key.
var SAD_LINE_LEGACY_ALIASES_ = {
  source_warehouse_id: 'recommended_source_warehouse_id',
  source_available_qty_snapshot: 'source_initial_available_qty_snapshot',
  ship_from: 'selected_source_warehouse_id',
  destination: 'selected_destination_warehouse_id'
};

// Copy legacy alias keys to their canonical name when the canonical key is absent (never overwrites an
// explicitly-provided canonical value).
function sadApplyLineAliases_(l) {
  for (var legacy in SAD_LINE_LEGACY_ALIASES_) {
    if (!SAD_LINE_LEGACY_ALIASES_.hasOwnProperty(legacy)) continue;
    var canon = SAD_LINE_LEGACY_ALIASES_[legacy];
    if ((l[canon] == null || l[canon] === '') && l[legacy] != null && l[legacy] !== '') l[canon] = l[legacy];
  }
  return l;
}

// ---- upsertShippingAllocationDraft --------------------------------
/**
 * Create/update ONE allocation-draft header. Body:
 *   { allocation_draft_id?, planning_cycle?, source_page?, company?, country?, marketplace?, status?,
 *     generation_type?, calculation_run_id?, calculated_at?, source_data_as_of?, draft_version?,
 *     created_by?, note? }
 * status defaults to draft; generation_type defaults to user_created. If no id is given, an existing
 * header matching planning_cycle+company+country+marketplace+draft_version is reused (idempotent);
 * a repeated calculation_run_id is treated as the same draft. Returns { allocation_draft_id }.
 */
function handleUpsertShippingAllocationDraft_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
  var now = procurementTimestamp_();
  var actor = String((body && body.created_by) || 'inventory-replenishment').trim();
  var status = String((body && body.status) || 'draft').trim();
  if (!SAD_STATUSES_[status]) status = 'draft';
  var genType = String((body && body.generation_type) || 'user_created').trim();
  if (!SAD_GENERATION_TYPES_[genType]) genType = 'user_created';
  var draftVersion = String((body && body.draft_version) || '1').trim();

  var id = String((body && body.allocation_draft_id) || '').trim();
  var found = id ? procurementFindRow_(sh, 'allocation_draft_id', id) : null;

  // Idempotent match on the uniqueness key when no id was supplied.
  if (!id) {
    var pc = String((body && body.planning_cycle) || '').trim();
    var co = String((body && body.company) || '').trim();
    var cy = String((body && body.country) || '').trim();
    var mk = String((body && body.marketplace) || '').trim();
    var data = sh.getDataRange().getValues();
    if (data.length >= 2 && pc) {
      var h = data[0].map(function (x) { return String(x).trim(); });
      var ci = { pc: h.indexOf('planning_cycle'), co: h.indexOf('company'), cy: h.indexOf('country'), mk: h.indexOf('marketplace'), dv: h.indexOf('draft_version'), id: h.indexOf('allocation_draft_id') };
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][ci.pc]).trim() === pc && String(data[r][ci.co]).trim() === co &&
            String(data[r][ci.cy]).trim() === cy && String(data[r][ci.mk]).trim() === mk &&
            String(data[r][ci.dv]).trim() === draftVersion) {
          id = String(data[r][ci.id]).trim(); found = procurementFindRow_(sh, 'allocation_draft_id', id); break;
        }
      }
    }
  }

  if (found) {
    function setCol(name, val) { var c = found.col(name); if (c !== -1) sh.getRange(found.row, c + 1).setValue(val); }
    setCol('status', status);
    if (body && body.calculation_run_id != null) setCol('calculation_run_id', String(body.calculation_run_id));
    if (body && body.calculated_at != null) setCol('calculated_at', String(body.calculated_at));
    if (body && body.source_data_as_of != null) setCol('source_data_as_of', String(body.source_data_as_of));
    if (body && body.note != null) setCol('note', String(body.note));
    setCol('updated_by', actor);
    setCol('updated_at', now);
    return jsonResponse_({ success: true, data: { allocation_draft_id: id, updated: true } });
  }

  if (!id) id = 'SAD-' + Utilities.getUuid().substring(0, 10).toUpperCase();
  procurementAppendByHeader_(sh, {
    allocation_draft_id: id,
    planning_cycle: String((body && body.planning_cycle) || '').trim(),
    source_page: String((body && body.source_page) || 'inventory_replenishment').trim(),
    company: String((body && body.company) || '').trim(),
    country: String((body && body.country) || '').trim(),
    marketplace: String((body && body.marketplace) || '').trim(),
    status: status,
    generation_type: genType,
    calculation_run_id: String((body && body.calculation_run_id) || '').trim(),
    calculated_at: String((body && body.calculated_at) || '').trim(),
    source_data_as_of: String((body && body.source_data_as_of) || '').trim(),
    draft_version: draftVersion,
    created_by: actor, created_at: now, updated_by: actor, updated_at: now,
    submitted_by: '', submitted_at: '', cancelled_by: '', cancelled_at: '', cancel_reason: '',
    note: String((body && body.note) || '').trim()
  });
  return jsonResponse_({ success: true, data: { allocation_draft_id: id, created: true } });
}

// ---- upsertShippingAllocationDraftLines ---------------------------
/**
 * UPSERT lines by allocation_draft_line_id (NOT a blanket replace — that would wipe the immutable
 * recommendation snapshot). Body:
 *   { allocation_draft_id, lines: [ { allocation_draft_line_id?, sku, planned_qty?,
 *     selected_source_warehouse_id?, selected_destination_warehouse_id?, selected_*?, expected_arrival?,
 *     override_reason?, recommended_qty?, recommended_*?, calculated_gap_qty?, window_code?,
 *     required_by_date?, units_per_carton?, ... } ] }
 *   (legacy ship_from / destination / source_warehouse_id / source_available_qty_snapshot are accepted
 *    as read-only aliases via sadApplyLineAliases_ and mapped onto the canonical columns.)
 * Rules (§D quantity protection):
 *   - Existing line (id matches): update planned_qty + Execution-Plan fields always; update a
 *     recommendation-snapshot field ONLY if the incoming line supplies it (else preserved).
 *   - New line: append; if planned_qty omitted, initialize planned_qty = recommended_qty.
 * MUST NOT persist uncovered_qty / coverage_status / window_label / display strings (§C).
 * Returns { line_count, created, updated }.
 */
function handleUpsertShippingAllocationDraftLines_(body) {
  var draftId = String((body && body.allocation_draft_id) || '').trim();
  if (!draftId) return jsonResponse_({ success: false, error: 'allocation_draft_id required' });
  var lines = (body && body.lines) || [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'shipping_allocation_draft_lines', SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_);
  var now = procurementTimestamp_();
  var created = 0, updated = 0;

  function isRec(name) { for (var i = 0; i < SAD_RECOMMENDATION_FIELDS_.length; i++) if (SAD_RECOMMENDATION_FIELDS_[i] === name) return true; return false; }
  var EXEC_FIELDS = ['planned_qty', 'selected_source_warehouse_id', 'selected_destination_warehouse_id',
    'selected_source_warehouse_code_snapshot', 'selected_destination_warehouse_code_snapshot',
    'selected_rate_card_id', 'selected_lead_time_id', 'selected_carrier_id', 'selected_shipping_method',
    'selected_last_mile_delivery', 'expected_arrival', 'override_reason', 'line_status', 'route_no', 'units_per_carton', 'note'];

  for (var i = 0; i < lines.length; i++) {
    var l = sadApplyLineAliases_(lines[i] || {});
    var lineId = String(l.allocation_draft_line_id || '').trim();
    var found = lineId ? procurementFindRow_(sh, 'allocation_draft_line_id', lineId) : null;
    if (found) {
      function setU(name) { if (l[name] != null) { var c = found.col(name); if (c !== -1) sh.getRange(found.row, c + 1).setValue(String(l[name])); } }
      // Execution-Plan (user) fields — always update when provided.
      EXEC_FIELDS.forEach(setU);
      // Recommendation snapshot — update ONLY when explicitly provided (preserve otherwise).
      SAD_RECOMMENDATION_FIELDS_.forEach(function (f) { if (l[f] != null && l[f] !== '') setU(f); });
      var uc = found.col('updated_at'); if (uc !== -1) sh.getRange(found.row, uc + 1).setValue(now);
      updated++;
    } else {
      if (!lineId) lineId = 'SADL-' + Utilities.getUuid().substring(0, 10).toUpperCase();
      var recQty = (l.recommended_qty != null && l.recommended_qty !== '') ? procurementNum_(l.recommended_qty) : '';
      var planned = (l.planned_qty != null && l.planned_qty !== '') ? procurementNum_(l.planned_qty)
        : (recQty !== '' ? recQty : '');   // first creation: planned_qty = recommended_qty
      var rowObj = { allocation_draft_line_id: lineId, allocation_draft_id: draftId, created_at: now, updated_at: now,
        planned_qty: planned, recommended_qty: recQty };
      // Copy all remaining provided canonical fields (skip forbidden display fields).
      SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.forEach(function (h) {
        if (h in rowObj) return;
        if (l[h] != null) rowObj[h] = String(l[h]);
      });
      procurementAppendByHeader_(sh, rowObj);
      created++;
    }
  }
  return jsonResponse_({ success: true, data: { allocation_draft_id: draftId, line_count: created + updated, created: created, updated: updated } });
}

// ---- submitShippingAllocationDrafts -------------------------------
/** Mark drafts submitted. Body: { draft_ids: [ ... ], submitted_by? }. Never deletes rows. */
function handleSubmitShippingAllocationDrafts_(body) {
  var ids = (body && body.draft_ids) || [];
  if (!ids.length) return jsonResponse_({ success: false, error: 'draft_ids required' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
  var now = procurementTimestamp_();
  var actor = String((body && body.submitted_by) || 'inventory-replenishment').trim();
  var n = 0;
  for (var i = 0; i < ids.length; i++) {
    var id = String(ids[i] || '').trim();
    if (!id) continue;
    var found = procurementFindRow_(sh, 'allocation_draft_id', id);
    if (!found) continue;
    function setCol(name, val) { var c = found.col(name); if (c !== -1) sh.getRange(found.row, c + 1).setValue(val); }
    setCol('status', 'submitted'); setCol('submitted_by', actor); setCol('submitted_at', now);
    setCol('updated_by', actor); setCol('updated_at', now);
    n++;
  }
  return jsonResponse_({ success: true, data: { submitted: n } });
}
