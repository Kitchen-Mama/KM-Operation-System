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

// SCHEMA AUTHORITY = the EXISTING user-approved live DB (30-col header / 28-col line). Route context is
// header-level; the line is SKU + qty grain. No selected_* / carrier-cost / user_edited columns on the line
// (those were a prior 52-col SOURCE assumption, not the live DB). Do NOT expand the schema without a separate
// user-authorized migration.
// C2-D1R (2026-08-05): reconciled BYTE-FOR-BYTE to the user-approved EXISTING live DB schema (30-col header
// route grain / 28-col line). The prior 23-col header + 52-col line (Model-1) was a SOURCE expectation that did
// NOT match the live DB — it was the root cause of the PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH. Route context
// (From/To/Method/Last-mile) is HEADER-level here (recommended_* on the Draft header); the line owns SKU + qty.
// recommendation_group_no exists on the header but Phase-1 does NOT use it for multi-active-draft / multi-vessel
// (K3 excludes it). Owner: docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md.
var SHIPPING_ALLOCATION_DRAFTS_HEADERS_ = [
  'allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
  // header-level route context (system recommendation snapshot for this Draft's single route)
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
  'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery',
  // generation / calculation provenance
  'generation_type', 'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of', 'draft_version',
  // audit / lifecycle
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
  // source-availability snapshots + allocation sequence (immutable)
  'source_initial_available_qty_snapshot', 'source_available_before_allocation_snapshot', 'allocation_sequence',
  // recommendation reason/flags + immutable recommended qty snapshot
  'recommendation_reason', 'recommendation_flags', 'recommended_qty',
  // F1-7N-FA-3C-R6F1 — per-source axis, at the CANONICAL LIVE position (immediately after recommended_qty, BEFORE the
  // user Execution Plan). This is the exact byte-for-byte live production order (djb2 '|' fingerprint = e4880646, 30
  // cols). Under the K2 shipment-group model the source warehouse is a HEADER grouping dimension; on the line these
  // are the denormalized per-line source snapshot carried for the natural key. The prior R3C2 per-source-qty column
  // `source_allocated_qty_snapshot` is NOT present in the live schema — it was an accidental source-only 31st field
  // (never live-verified) and is REMOVED here so the runtime authority equals the live 30-col schema exactly.
  'source_warehouse_id', 'source_warehouse_code_snapshot',
  // user Execution Plan (qty grain — route context is on the Draft header)
  'planned_qty', 'units_per_carton', 'route_no',
  // status / audit
  'line_status', 'override_reason', 'note', 'created_at', 'updated_at'
];

var SAD_STATUSES_ = { draft: 1, site_confirmed: 1, submitted: 1, cancelled: 1 };
var SAD_GENERATION_TYPES_ = { scheduled: 1, manual_refresh: 1, user_created: 1 };

// The recommendation-snapshot fields — written only when the incoming line supplies them, so an
// Execution-Plan save (which omits them) never clobbers the immutable recommendation (§D). Canonical
// names (2026-07-27 sync).
// C2-D1R: reconciled to the 28-col LINE snapshot fields ONLY. The recommended route fields
// (recommended_source/destination_warehouse_id/code, recommended_shipping_method/last_mile) are HEADER-level
// now, so they are NOT line snapshot-protected fields.
var SAD_RECOMMENDATION_FIELDS_ = [
  'recommended_qty',
  'source_initial_available_qty_snapshot', 'source_available_before_allocation_snapshot', 'allocation_sequence',
  'recommendation_reason', 'recommendation_flags',
  'regular_demand_snapshot', 'special_event_demand_snapshot', 'destination_stock_snapshot',
  'qualified_incoming_snapshot', 'approved_supply_snapshot', 'calculated_gap_qty',
  'window_code', 'window_start_date', 'window_end_date', 'required_by_date'
];

// Read-only legacy aliases accepted on the incoming shipping-draft line payload → canonical column.
// Keeps the existing (not-yet-migrated, still gated) Inventory Replenishment caller working without
// editing it; new writes always use the canonical key.
// C2-D1R: the only LINE-level legacy alias that still targets an existing 28-col line column. Route aliases
// (ship_from/destination/source_warehouse_id) belonged to the removed selected_* line grain — route is now a
// HEADER field and the frontend header payload uses the canonical recommended_* names directly.
var SAD_LINE_LEGACY_ALIASES_ = {
  source_available_qty_snapshot: 'source_initial_available_qty_snapshot'
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
// Round 1H enforcement: PUBLIC header route now acquires the ScriptLock + terminal-guards an existing header
// before delegating to the (private) single-keyed-row upsert core. Shipping stays DEPLOYMENT-GATED (scaffold).
function handleUpsertShippingAllocationDraft_(body) {
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
  try {
    var ss0 = SpreadsheetApp.getActiveSpreadsheet();
    var id0 = String((body && body.allocation_draft_id) || '').trim();
    if (id0) {
      var sh0 = procurementEnsureSheet_(ss0, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
      var f0 = procurementFindRow_(sh0, 'allocation_draft_id', id0);
      if (f0) { var cS0 = f0.col('status'); var st0 = cS0 !== -1 ? String(sh0.getRange(f0.row, cS0 + 1).getValue()).trim().toLowerCase() : ''; if (st0 === 'submitted' || st0 === 'cancelled') return jsonResponse_({ success: false, error: 'IMMUTABLE_TERMINAL_STATUS:' + st0, stage: 'terminal' }); }
    }
    return sadUpsertDraftHeaderCore_(body);
  } finally { try { lock.releaseLock(); } catch (e2) { /* best-effort release */ } }
}

// Private single-keyed-row shipping header upsert core (reached ONLY under lock via the public handler above).
function sadUpsertDraftHeaderCore_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
  var now = procurementTimestamp_();
  var actor = String((body && body.created_by) || 'inventory-replenishment').trim();
  var status = String((body && body.status) || 'draft').trim();
  if (!SAD_STATUSES_[status]) status = 'draft';
  var genType = String((body && body.generation_type) || 'user_created').trim();
  if (!SAD_GENERATION_TYPES_[genType]) genType = 'user_created';
  var draftVersion = String((body && body.draft_version) || '1').trim();

  // C2-D1R header-route completeness gate (§8): when the header carries route intent, From + To + Method must
  // all be present (unless this is a soft-cancel). A partial route rejects with PLAN_HEADER_INCOMPLETE and
  // writes nothing. Route context is HEADER-level in the approved 30-col schema.
  var hasRouteIntent = !!(body && (String(body.recommended_source_warehouse_id || '').trim() ||
    String(body.recommended_shipping_method || '').trim() || String(body.recommended_destination_warehouse_id || '').trim()));
  if (hasRouteIntent && status !== 'cancelled' && !sadHeaderRouteIsComplete_(body)) {
    return jsonResponse_({ success: false, error: 'PLAN_HEADER_INCOMPLETE — a Draft route context requires From + To + Method (zero rows written)' });
  }

  var allowReconcile = (body && body.allow_legacy_reconcile === true);
  var id = String((body && body.allocation_draft_id) || '').trim();
  var found = id ? procurementFindRow_(sh, 'allocation_draft_id', id) : null;

  // F1-7N-FA-3C-R6F2A: UNIFIED active-draft resolution (the SAME identity generation uses). Route-complete → K2
  // (CREATE deterministic SADH-K2- id / REUSE / CONFLICT). Route-INCOMPLETE new Draft NEVER creates a K3 header:
  // BLOCK with ROUTE_INCOMPLETE_NEW_DRAFT, or LEGACY_ROUTE_RECONCILIATION_REQUIRED when an existing legacy row matches
  // (unless an explicit USER migration sets allow_legacy_reconcile). draft_version stays version/lineage, not the key.
  if (!id) {
    var res = sadResolveActiveDraftK2OrK3_(sh, body, { allowLegacyReconcile: allowReconcile });
    if (res.status === 'CONFLICT') {
      return jsonResponse_({ success: false, error: 'BLOCKED_CONFLICT — more than one Active Draft for this ' + (res.k2 ? 'shipment group (K2)' : 'scope (K3)') + '; resolve manually (zero rows written)', data: { status: 'BLOCKED_CONFLICT', conflictIds: res.conflictIds, k2: res.k2 } });
    }
    if (res.status === 'BLOCK') {
      return jsonResponse_({ success: false, error: res.reason + ' — ' + (res.reason === 'ROUTE_INCOMPLETE_NEW_DRAFT' ? 'a new Draft requires a COMPLETE route (From+To+Method); no K3 header is created for a missing route' : 'this scope has an existing route-incomplete/legacy Draft — reconcile via an explicit USER migration') + ' (zero rows written)', data: { status: res.reason, existing_id: res.id || null } });
    }
    if (res.status === 'REUSE') { id = res.id; found = procurementFindRow_(sh, 'allocation_draft_id', id); }
    else if (res.status === 'CREATE' && res.id) { id = res.id; }   // K2 deterministic id (found stays null → INSERT with it)
  }
  // A: editing an existing route-INCOMPLETE (legacy) row by explicit id is fail-closed unless an explicit USER migration.
  if (found) {
    var legR = sadLegacyReconcileReason_(sh, found, allowReconcile);
    if (legR) return jsonResponse_({ success: false, error: legR + ' — ' + sadReconcileMessage_(legR) + ' (zero rows written)', data: { status: legR, existing_id: id } });
  }

  if (found) {
    function setCol(name, val) { var c = found.col(name); if (c !== -1) sh.getRange(found.row, c + 1).setValue(val); }
    setCol('status', status);
    // header-level route context (recommended_*) — update only when explicitly provided (C2-D1R).
    ['recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
      'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
      'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery'].forEach(function (f) {
      if (body && body[f] != null) setCol(f, String(body[f]));
    });
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
    // header-level route context (C2-D1R — recommended_* on the 30-col header)
    recommended_source_warehouse_id: String((body && body.recommended_source_warehouse_id) || '').trim(),
    recommended_destination_warehouse_id: String((body && body.recommended_destination_warehouse_id) || '').trim(),
    recommended_source_warehouse_code_snapshot: String((body && body.recommended_source_warehouse_code_snapshot) || '').trim(),
    recommended_destination_warehouse_code_snapshot: String((body && body.recommended_destination_warehouse_code_snapshot) || '').trim(),
    recommendation_group_no: String((body && body.recommendation_group_no) || '').trim(),
    recommended_shipping_method: String((body && body.recommended_shipping_method) || '').trim(),
    recommended_last_mile_delivery: String((body && body.recommended_last_mile_delivery) || '').trim(),
    generation_type: genType,
    calculation_run_id: String((body && body.calculation_run_id) || '').trim(),
    formula_version: String((body && body.formula_version) || '').trim(),
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
 *   { allocation_draft_id, lines: [ { allocation_draft_line_id?, sku, site_sku?, planned_qty?,
 *     recommended_qty?, route_no?, units_per_carton?, override_reason?, note?, line_status?,
 *     calculated_gap_qty?, window_code?, required_by_date?, ... } ] }
 *   (C2-D1R: route context — From/To/Method — is HEADER-level; the 28-col line carries SKU + qty only.
 *    legacy source_available_qty_snapshot is accepted as a read-only alias via sadApplyLineAliases_.)
 * Rules (§D quantity protection):
 *   - Existing line (id matches): update planned_qty + Execution-Plan fields always; update a
 *     recommendation-snapshot field ONLY if the incoming line supplies it (else preserved).
 *   - New line: append; if planned_qty omitted, initialize planned_qty = recommended_qty.
 * MUST NOT persist uncovered_qty / coverage_status / window_label / display strings (§C).
 * Returns { line_count, created, updated }.
 */
// Round 1H enforcement: PUBLIC shipping-lines route now acquires the ScriptLock + header terminal-guard before
// delegating to the (private) keyed (allocation_draft_line_id) upsert core, which additionally skips any
// line-terminal row. Shipping remains DEPLOYMENT-GATED (source-mirror scaffold); full optimistic-token + KMUE
// natural-key unification for shipping is a documented pending item (the live procurement path uses KMUE today).
function handleUpsertShippingAllocationDraftLines_(body) {
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
  try {
    var ss0 = SpreadsheetApp.getActiveSpreadsheet();
    var did = String((body && body.allocation_draft_id) || '').trim();
    if (did) {
      var hsh = procurementEnsureSheet_(ss0, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
      var hf = procurementFindRow_(hsh, 'allocation_draft_id', did);
      if (hf) { var cs = hf.col('status'); var stt = cs !== -1 ? String(hsh.getRange(hf.row, cs + 1).getValue()).trim().toLowerCase() : ''; if (stt === 'submitted' || stt === 'cancelled') return jsonResponse_({ success: false, error: 'IMMUTABLE_TERMINAL_STATUS:' + stt, stage: 'terminal' }); }
    }
    return sadUpsertLinesKeyedCore_(body);
  } finally { try { lock.releaseLock(); } catch (e2) { /* best-effort release */ } }
}

// F1-7N-FA-3C-R6F — GENERATED_LINE_ID reconciliation. The KMPR generate path (bundled core, via 61_) writes each
// AI-Plan line keyed ONLY by its natural key (sku|site_sku|window_code|source_warehouse_id|route_no within one
// allocation_draft_id — mirrors KMPR TABLES.WEEKLY_SHIPPING.lineKey) and leaves `allocation_draft_line_id` BLANK.
// The frontend Save path here keys by `allocation_draft_line_id`, so a generated line edited from the UI used to
// append a DUPLICATE (no id match → INSERT). These helpers let this path (a) find the existing generated row by its
// natural key when the incoming id is blank, and (b) mint a DETERMINISTIC id so the SAME logical line always resolves
// to the SAME id (no random-UUID drift). FROZEN id formula:
//   allocation_draft_line_id = 'SADL-' + upper(FNV1a-hex( allocation_draft_id|sku|site_sku|window_code|source_warehouse_id|route_no ))
// All lowercased/trimmed. No live DB access here — pure over the row + a single sheet scan under the caller's lock.
function sadLineNaturalKey_(draftId, l) {
  function s(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  return [s(draftId), s(l.sku), s(l.site_sku), s(l.window_code), s(l.source_warehouse_id), s(l.route_no)].join('|');
}
function sadFnv1a_(str) { var h = 0x811c9dc5; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
function sadDeterministicLineId_(draftId, l) { return 'SADL-' + sadFnv1a_(sadLineNaturalKey_(draftId, l)).toUpperCase(); }
// Scan the lines sheet for an existing row matching the natural key within draftId. Returns a procurementFindRow_-shaped
// { row (1-based), col(name) } or null. Used ONLY when the incoming line has no explicit allocation_draft_line_id.
function sadFindLineByNaturalKey_(sh, draftId, l) {
  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return null;
  var headers = data[0].map(function (h) { return String(h).trim(); });
  function idx(n) { return headers.indexOf(n); }
  var cDraft = idx('allocation_draft_id'), cSku = idx('sku');
  if (cDraft === -1 || cSku === -1) return null;
  var cSite = idx('site_sku'), cWin = idx('window_code'), cSrc = idx('source_warehouse_id'), cRoute = idx('route_no');
  function s(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  var want = sadLineNaturalKey_(draftId, l);
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var nk = [s(row[cDraft]), s(row[cSku]), cSite === -1 ? '' : s(row[cSite]), cWin === -1 ? '' : s(row[cWin]),
      cSrc === -1 ? '' : s(row[cSrc]), cRoute === -1 ? '' : s(row[cRoute])].join('|');
    if (nk === want) return { row: r + 1, col: function (n) { return idx(n); } };
  }
  return null;
}

// ================================================================================================================
// F1-7N-FA-3C-R6F1 — K2 SHIPMENT-GROUP CONTRACT (FROZEN, DETERMINISTIC MACHINERY — NOT LIVE-WIRED THIS ROUND)
// ----------------------------------------------------------------------------------------------------------------
// The latest USER business decision supersedes the Phase-1 K3 freeze: ONE shipping_allocation_drafts Header ==
// ONE shipment group sharing the 10-dimension route grouping key below. Different source warehouse / destination /
// shipping method / last-mile / recommendation_group_no => a SEPARATE Header. Lines carry SKU + window (+ their own
// route evidence) UNDER that Header. A Header must never contain lines with incompatible route grouping values.
//
// These are the FROZEN, TESTED contract functions (key · deterministic Header id · deterministic Line id ·
// CREATE/REUSE/CONFLICT · incompatible-route guard · split/regroup). They are DELIBERATELY NOT wired into the live
// active-draft resolution: the live save path keeps resolving on the landed K3 scope (sadResolveActiveDraft_) so the
// current save<->generation key AGREEMENT is preserved. LIVE K2 ACTIVATION IS HALTED — the bundled AI-Plan generation
// engine (KMWRB/KMPB/KMPPB) does NOT derive four of the ten K2 dimensions (recommended_shipping_method,
// recommended_last_mile_delivery, recommended_destination_warehouse_id, recommendation_group_no are BLANK at
// generation; grep-verified). Grouping on blank dims would collapse every route into ONE group. Activation requires
// the Route-Derivation Input Matrix (design-freeze §45) + INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ flip + live
// verification — all USER-owned. Until then: K2_CONTRACT_AND_MACHINERY_READY = YES · K2_LIVE_GENERATION_ACTIVATED = NO.

// The 10 canonical K2 grouping dimensions, in frozen order. Route context is HEADER-level (read from recommended_*).
var SAD_K2_GROUP_DIMENSIONS_ = ['planning_cycle', 'company', 'country', 'marketplace', 'source_page',
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no'];

// Canonical K2 group key from a header-shaped object. Trimmed + lowercased, '|'-joined in the frozen dim order.
// Accepts either the persisted recommended_* names OR the short route aliases (source_warehouse_id /
// destination_warehouse_id / shipping_method / last_mile_delivery) so a caller can key off either shape.
function sadK2GroupKey_(h) {
  h = h || {};
  function s(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function pick(canon, alias) { var a = h[canon]; if (a == null || a === '') a = h[alias]; return s(a); }
  return [s(h.planning_cycle), s(h.company), s(h.country), s(h.marketplace), s(h.source_page || 'inventory_replenishment'),
    pick('recommended_source_warehouse_id', 'source_warehouse_id'),
    pick('recommended_destination_warehouse_id', 'destination_warehouse_id'),
    pick('recommended_shipping_method', 'shipping_method'),
    pick('recommended_last_mile_delivery', 'last_mile_delivery'),
    s(h.recommendation_group_no)].join('|');
}
// Deterministic K2 Header id: SADH-K2-<upper FNV1a hex of the K2 group key>. Same shipment group => same id (stable).
function sadK2DeterministicHeaderId_(h) { return 'SADH-K2-' + sadFnv1a_(sadK2GroupKey_(h)).toUpperCase(); }

// K2 LINE natural key: sku + site_sku + window_code ONLY (source/route are HEADER dims under K2, not line identity).
function sadK2LineNaturalKey_(draftId, l) {
  function s(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  l = l || {};
  return [s(draftId), s(l.sku), s(l.site_sku), s(l.window_code)].join('|');
}
// Deterministic K2 LINE id: SADL-K2-<upper FNV1a hex of the K2 line natural key>.
function sadK2DeterministicLineId_(draftId, l) { return 'SADL-K2-' + sadFnv1a_(sadK2LineNaturalKey_(draftId, l)).toUpperCase(); }

// F1-7N-FA-3C-R6F2G (B) — K2-AWARE NEW-LINE id authority (wired into the atomic writer below; PERMANENT fix for the
// R6F2F2 freeze/writer divergence where a K2 CREATE minted generic SADL- ids while the freeze precomputed SADL-K2-).
// A genuine K2 shipment group mints the K2 line id (SADL-K2-, natural key sku|site_sku|window_code); a generic/legacy
// draft keeps the SADL- scheme (natural key sku|site_sku|window_code|source_warehouse_id|route_no). K2 CREATE and the
// missing-line REGENERATE path use the SAME K2 authority. `sadIsK2Group_` classifies from the GROUP authority — the
// resolver's k2 decision when known, else the header's route completeness (the exact predicate the K2 resolver uses),
// corroborated by (never solely decided by) a stored SADH-K2- id — so a caller-supplied prefix alone can never
// reclassify a draft. For a K2 CREATE the new-line id is ALWAYS derived from the canonical K2 natural key, so a
// caller-supplied arbitrary line id is never trusted to name a new K2 line.
function sadIsK2Group_(resolvedK2, headerId, header) {
  if (resolvedK2 === true) return true;
  if (resolvedK2 === false && !(String(headerId || '').indexOf('SADH-K2-') === 0)) return false;
  return (String(headerId || '').indexOf('SADH-K2-') === 0) || sadHeaderRouteIsComplete_(header || {});
}
function sadNewLineId_(isK2, draftId, l) { return isK2 ? sadK2DeterministicLineId_(draftId, l) : sadDeterministicLineId_(draftId, l); }

// CREATE / REUSE / CONFLICT over the K2 group key among ACTIVE headers (draft/site_confirmed/partially_submitted).
// rows = header-shaped objects (each carrying allocation_draft_id + the K2 dims + status). Pure; no sheet access.
//   0 active match => CREATE (deterministic id) · 1 => REUSE (that id) · >1 => BLOCKED_CONFLICT (all ids; zero mutation).
function sadK2ResolveActiveDraft_(rows, wantHeader) {
  var ACTIVE = { draft: 1, site_confirmed: 1, partially_submitted: 1 };
  var want = sadK2GroupKey_(wantHeader), matches = [];
  (rows || []).forEach(function (r) {
    if (!ACTIVE[String(r && r.status == null ? '' : r.status).trim().toLowerCase()]) return;
    if (sadK2GroupKey_(r) === want) matches.push(String(r.allocation_draft_id == null ? '' : r.allocation_draft_id).trim());
  });
  if (matches.length === 0) return { status: 'CREATE', k2Key: want, allocation_draft_id: sadK2DeterministicHeaderId_(wantHeader) };
  if (matches.length === 1) return { status: 'REUSE', k2Key: want, allocation_draft_id: matches[0] };
  return { status: 'BLOCKED_CONFLICT', k2Key: want, conflictIds: matches };
}

// Incompatible-route guard: EVERY line's route grouping values must match the Header's shipment group. A line whose
// source/destination/method/last-mile/group_no differs from the Header belongs under a DIFFERENT K2 Header. A line
// that OMITS a dim inherits the Header (blank line dim is NOT a violation). Pure. Returns
// { compatible, violations:[{ index, field, headerValue, lineValue }] }.
function sadK2LinesRouteCompatibleWithHeader_(headerRow, lines) {
  function s(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  headerRow = headerRow || {};
  var dims = [
    ['recommended_source_warehouse_id', 'source_warehouse_id'],
    ['recommended_destination_warehouse_id', 'destination_warehouse_id'],
    ['recommended_shipping_method', 'shipping_method'],
    ['recommended_last_mile_delivery', 'last_mile_delivery'],
    ['recommendation_group_no', 'recommendation_group_no']
  ];
  var violations = [];
  (lines || []).forEach(function (l, i) {
    l = l || {};
    dims.forEach(function (d) {
      var lv = l[d[1]]; if (lv == null || lv === '') return;              // omitted => inherits header (not a violation)
      var hv = s(headerRow[d[0]]);
      if (s(lv) !== hv) violations.push({ index: i, field: d[1], headerValue: hv, lineValue: s(lv) });
    });
  });
  return { compatible: violations.length === 0, violations: violations };
}

// SPLIT / REGROUP: partition a flat set of route-bearing lines into K2 group buckets keyed by each line's own route
// dims. Each bucket => ONE K2 Header (deterministic id from the bucket route). This is the frozen regroup contract for
// when route fields change: a re-grouping NEVER merges incompatible routes into one Header. Pure. Returns an ordered
// [{ k2Key, allocation_draft_id, header, lines }].
function sadK2PartitionLinesIntoGroups_(scope, lines) {
  scope = scope || {};
  var buckets = {}, order = [];
  (lines || []).forEach(function (l) {
    l = l || {};
    var header = {
      planning_cycle: scope.planning_cycle, company: scope.company, country: scope.country,
      marketplace: scope.marketplace, source_page: scope.source_page,
      recommended_source_warehouse_id: l.source_warehouse_id, recommended_destination_warehouse_id: l.destination_warehouse_id,
      recommended_shipping_method: l.shipping_method, recommended_last_mile_delivery: l.last_mile_delivery,
      recommendation_group_no: l.recommendation_group_no
    };
    var key = sadK2GroupKey_(header);
    if (!buckets[key]) { buckets[key] = { k2Key: key, allocation_draft_id: sadK2DeterministicHeaderId_(header), header: header, lines: [] }; order.push(key); }
    buckets[key].lines.push(l);
  });
  return order.map(function (k) { return buckets[k]; });
}
// ================================================================================================================

// ================================================================================================================
// F1-7N-FA-3C-R6F2A (B/C) — payload fingerprint (REUSE vs REGENERATE) + user-edit ownership rule.
// Fingerprint covers the persisted BUSINESS fields (header route + status + each line's business fields, natural-key
// sorted); it EXCLUDES server ids / audit / draft_version. Equal fingerprint ⇒ REUSE (zero writes); different +
// editable ⇒ REGENERATE (update + draft_version++ once + adopt new calc evidence).
var SAD_K2_HEADER_FP_ = ['status', 'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
  'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
  'recommendation_group_no', 'recommended_shipping_method', 'recommended_last_mile_delivery'];
var SAD_K2_LINE_FP_ = ['sku', 'site_sku', 'window_code', 'window_start_date', 'window_end_date', 'required_by_date',
  'regular_demand_snapshot', 'special_event_demand_snapshot', 'destination_stock_snapshot', 'qualified_incoming_snapshot',
  'approved_supply_snapshot', 'calculated_gap_qty', 'source_initial_available_qty_snapshot',
  'source_available_before_allocation_snapshot', 'allocation_sequence', 'recommendation_reason', 'recommendation_flags',
  'recommended_qty', 'source_warehouse_id', 'source_warehouse_code_snapshot', 'planned_qty', 'units_per_carton',
  'route_no', 'line_status'];
function sadFpVal_(v) { return String(v == null ? '' : v).trim(); }
function sadK2PayloadFingerprint_(headerObj, linesArr) {
  headerObj = headerObj || {};
  var h = SAD_K2_HEADER_FP_.map(function (f) { return f + '=' + sadFpVal_(headerObj[f]); }).join('|');
  var ls = (linesArr || []).map(function (l) { return SAD_K2_LINE_FP_.map(function (f) { return sadFpVal_(l[f]); }).join('~'); });
  ls.sort();
  return 'k2fp-' + sadFnv1a_(h + '||' + ls.join('||')).toUpperCase();
}

// F1-7N-FA-3C-R6F2G6 — TRUE zero-write REUSE. The raw fingerprint above compares sadFpVal_ (plain String().trim()) of
// each FP field. A persisted cell that Google Sheets coerces (a DATE field read back as a Date object vs an incoming
// 'yyyy-MM-dd' string; a number vs its numeric string; decimal/format noise) makes priorFp !== incFp even when the
// business content is byte/semantically identical — so the atomic writer took the REGENERATE branch (physical in-place
// setValue on the header route/lineage + draft_version++ + every line's updated_at) at row-count delta 0/0, and the
// controlled retry reported REGENERATED instead of a true no-op. sadK2SemanticPayloadEqual_ re-compares the SAME FP
// fields through a canonical, representation-robust normalizer so a representation-only difference is recognised as a
// no-op (REUSE, zero write). It NEVER collapses a genuine value change (dates to day granularity, numbers to canonical
// numeric form, strings trimmed), so legitimate user-directed MANUAL_REGENERATE for a changed payload is unaffected.
var SAD_K2_FP_DATE_FIELDS_ = { window_start_date: 1, window_end_date: 1, required_by_date: 1 };
var SAD_K2_FP_NUMERIC_FIELDS_ = { recommendation_group_no: 1, regular_demand_snapshot: 1, special_event_demand_snapshot: 1,
  destination_stock_snapshot: 1, qualified_incoming_snapshot: 1, approved_supply_snapshot: 1, calculated_gap_qty: 1,
  source_initial_available_qty_snapshot: 1, source_available_before_allocation_snapshot: 1, allocation_sequence: 1,
  recommended_qty: 1, planned_qty: 1, units_per_carton: 1 };
function sadCanonDate_(v) {
  if (v == null || v === '') return '';
  function z(x) { return ('0' + x).slice(-2); }
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var d = new Date(v.getTime() + 8 * 3600000);              // project tz Asia/Taipei (UTC+8) calendar date
    return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate());
  }
  var s = String(v).trim(); var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var dt = new Date(s); if (!isNaN(dt.getTime())) { var d2 = new Date(dt.getTime() + 8 * 3600000); return d2.getUTCFullYear() + '-' + z(d2.getUTCMonth() + 1) + '-' + z(d2.getUTCDate()); }
  return s;
}
function sadFpNorm_(field, value) {
  if (SAD_K2_FP_DATE_FIELDS_[field]) return sadCanonDate_(value);
  if (SAD_K2_FP_NUMERIC_FIELDS_[field]) { var s = String(value == null ? '' : value).trim(); if (s === '') return ''; var n = Number(s); return isFinite(n) ? String(n) : s; }
  return String(value == null ? '' : value).trim();
}
// F1-7N-FA-3C-R6F2G7A — the SEMANTIC-equivalence comparator (contract SAD_K2_SEM_CONTRACT_) used by the atomic REUSE
// branch AND by the read-only live authority summary/diagnostic (exactly the same comparator). It answers "would a
// REGENERATE change any persisted BUSINESS field?" It is representation-robust (R6F2G6 dates/numerics) and truthful to
// the writer's omit/default/preserve semantics — WITHOUT a wildcard "blank incoming → preserve". Every FP field belongs
// to exactly ONE explicit, frozen class:
//   1. EXCLUDED_LIFECYCLE (status, line_status) — audit/lifecycle fields the K2 payload authority (KMWRR) never emits and
//      regeneration does not treat as content (line_status is not patched by sadRegenerateLinePatch_; header status is
//      reset to 'draft' by the writer). EXCLUDED from equality and PRESERVED on REUSE (write-free, strictly safer than
//      REGENERATE). This was the exact R6F2G6→live false negative.
//   2. OPTIONAL_PRESERVE — business fields PROVEN optional from the writer contract: (a) buildGroupHeader /
//      buildK2GenerationPlan (KMWRR) structurally OMIT them from the regeneration payload (the K2 header carries no
//      recommended_*_warehouse_code_snapshot; the K2 line carries only sku/site_sku/window*/required_by_date/
//      source_warehouse_id/source_warehouse_code_snapshot/planned_qty/recommended_qty/units_per_carton — NOT the demand/
//      stock/gap/supply/allocation snapshots, recommendation_reason/flags, or the line route_no), and (b) the writer
//      patches them ONLY when the incoming provides them nonblank (SAD_RECOMMENDATION_FIELDS_ line patch + the header
//      code-snapshot / route-context patch), so an OMITTED incoming CANNOT change the stored cell. A regeneration
//      therefore can never alter these — an omitted incoming is a true no-op (equal); a NONBLANK incoming that differs
//      is still a real change (compared). This whitelist is EXPLICIT — no wildcard/default.
//   3. REQUIRED_OR_STRICT — everything else: identity/SKU/site-SKU/membership, quantity, window, route method/last-mile,
//      warehouse and group authorities KMWRR ALWAYS emits. Incoming blank equals stored blank ONLY; incoming blank with
//      stored nonblank is a MISSING_REQUIRED_INCOMING_FIELD (a blocking difference, never a silent preserve). Zero/false
//      are real NONBLANK values (blank≠zero, blank≠false); a nonblank unparseable numeric/date is UNKNOWN_UNPARSEABLE.
//   Lines are matched by K2 identity (sku|site_sku|window_code); membership must be EXACT (missing/extra ⇒ not equal).
var SAD_K2_SEM_CONTRACT_ = 'R6F2G7A-SEM-V3';
var SAD_K2_SEM_EXCLUDED_LIFECYCLE_ = { status: 1, line_status: 1 };
var SAD_K2_SEM_OPTIONAL_PRESERVE_ = { recommended_source_warehouse_code_snapshot: 1, recommended_destination_warehouse_code_snapshot: 1, regular_demand_snapshot: 1, special_event_demand_snapshot: 1, destination_stock_snapshot: 1, qualified_incoming_snapshot: 1, approved_supply_snapshot: 1, calculated_gap_qty: 1, source_initial_available_qty_snapshot: 1, source_available_before_allocation_snapshot: 1, allocation_sequence: 1, recommendation_reason: 1, recommendation_flags: 1, route_no: 1 };
// back-compat alias (identical membership) for the R6F2G6/G7 excluded-set name still referenced by the diagnostics.
var SAD_K2_SEM_EXCLUDE_ = { status: 1, line_status: 1 };
function sadK2SemFieldClass_(field) { if (SAD_K2_SEM_EXCLUDED_LIFECYCLE_[field]) return 'EXCLUDED_LIFECYCLE'; if (SAD_K2_SEM_OPTIONAL_PRESERVE_[field]) return 'OPTIONAL_PRESERVE'; return 'REQUIRED_OR_STRICT'; }
function sadK2LineIdentity_(l) { function s(v) { return String(v == null ? '' : v).trim().toLowerCase(); } l = l || {}; return s(l.sku) + '|' + s(l.site_sku) + '|' + s(l.window_code); }
// per-FP-field semantic verdict under the R6F2G7A contract → { equal, category, blocking }. categories: EXCLUDED_LIFECYCLE
// | BOTH_BLANK | OPTIONAL_PRESERVE_OMITTED | EQUAL | DATE_REPRESENTATION_EQUAL | NUMERIC_REPRESENTATION_EQUAL |
// MISSING_REQUIRED_INCOMING_FIELD | UNKNOWN_UNPARSEABLE | TRUE_BUSINESS_DIFFERENCE.
function sadK2SemFieldVerdict_(field, storedVal, incVal) {
  if (sadK2SemFieldClass_(field) === 'EXCLUDED_LIFECYCLE') return { equal: true, category: 'EXCLUDED_LIFECYCLE', blocking: false };
  var sBlank = String(storedVal == null ? '' : storedVal).trim() === '';
  var iBlank = String(incVal == null ? '' : incVal).trim() === '';
  if (iBlank) {
    if (sBlank) return { equal: true, category: 'BOTH_BLANK', blocking: false };                                  // both empty → no change
    if (sadK2SemFieldClass_(field) === 'OPTIONAL_PRESERVE') return { equal: true, category: 'OPTIONAL_PRESERVE_OMITTED', blocking: false };  // writer preserves; KMWRR omits
    return { equal: false, category: 'MISSING_REQUIRED_INCOMING_FIELD', blocking: true };                         // required authority vanished from the payload
  }
  // incoming NONBLANK (a provided 0 / false is compared) → canonical comparison; fail closed on an unparseable value
  if (SAD_K2_FP_NUMERIC_FIELDS_[field]) { if (!isFinite(Number(String(incVal).trim()))) return { equal: false, category: 'UNKNOWN_UNPARSEABLE', blocking: true }; if (!sBlank && !isFinite(Number(String(storedVal).trim()))) return { equal: false, category: 'UNKNOWN_UNPARSEABLE', blocking: true }; }
  if (SAD_K2_FP_DATE_FIELDS_[field]) { if (!/^\d{4}-\d\d-\d\d$/.test(sadCanonDate_(incVal))) return { equal: false, category: 'UNKNOWN_UNPARSEABLE', blocking: true }; if (!sBlank && !/^\d{4}-\d\d-\d\d$/.test(sadCanonDate_(storedVal))) return { equal: false, category: 'UNKNOWN_UNPARSEABLE', blocking: true }; }
  if (sadFpNorm_(field, storedVal) !== sadFpNorm_(field, incVal)) return { equal: false, category: 'TRUE_BUSINESS_DIFFERENCE', blocking: true };
  if (SAD_K2_FP_DATE_FIELDS_[field] && String(storedVal == null ? '' : storedVal).trim() !== String(incVal).trim()) return { equal: true, category: 'DATE_REPRESENTATION_EQUAL', blocking: false };
  if (SAD_K2_FP_NUMERIC_FIELDS_[field] && String(storedVal == null ? '' : storedVal).trim() !== String(incVal).trim()) return { equal: true, category: 'NUMERIC_REPRESENTATION_EQUAL', blocking: false };
  return { equal: true, category: 'EQUAL', blocking: false };
}
function sadK2SemFieldEqual_(field, storedVal, incVal) { return sadK2SemFieldVerdict_(field, storedVal, incVal).equal; }
function sadK2SemanticPayloadEqual_(hPrior, lPrior, hInc, lInc) {
  hPrior = hPrior || {}; hInc = hInc || {};
  for (var i = 0; i < SAD_K2_HEADER_FP_.length; i++) { var f = SAD_K2_HEADER_FP_[i]; if (!sadK2SemFieldEqual_(f, hPrior[f], hInc[f])) return false; }
  var pById = {}, iById = {};
  (lPrior || []).forEach(function (l) { pById[sadK2LineIdentity_(l)] = l; });
  (lInc || []).forEach(function (l) { iById[sadK2LineIdentity_(l)] = l; });
  var pk = Object.keys(pById).sort(), ik = Object.keys(iById).sort();
  if (pk.length !== ik.length) return false;
  for (var k = 0; k < pk.length; k++) if (pk[k] !== ik[k]) return false;
  for (var m = 0; m < pk.length; m++) { var sp = pById[pk[m]], si = iById[pk[m]]; for (var j = 0; j < SAD_K2_LINE_FP_.length; j++) { var lf = SAD_K2_LINE_FP_[j]; if (!sadK2SemFieldEqual_(lf, sp[lf], si[lf])) return false; } }
  return true;
}

// C — user-edit ownership: given the EXISTING persisted line + the incoming (regenerated) line, decide the fields to
// write on REGENERATE. recommended_qty + calculation snapshots = SYSTEM-owned (always adopt). note = USER-owned
// (preserved — a regeneration never restores an old AI note). planned_qty = USER-owned when override_reason is nonblank
// OR planned_qty differs from the PRIOR recommended_qty; otherwise it follows the newly regenerated recommended_qty.
// route/source/units are system route context. Returns a { field: value } patch to setValue on the existing row.
function sadRegenerateLinePatch_(existing, incoming) {
  existing = existing || {}; incoming = incoming || {};
  var patch = {};
  // system-owned: recommended_qty + snapshots + route context
  SAD_RECOMMENDATION_FIELDS_.forEach(function (f) { if (incoming[f] != null && incoming[f] !== '') patch[f] = String(incoming[f]); });
  ['route_no', 'units_per_carton', 'source_warehouse_id', 'source_warehouse_code_snapshot'].forEach(function (f) { if (incoming[f] != null) patch[f] = String(incoming[f]); });
  // planned_qty ownership
  var priorRec = sadFpVal_(existing.recommended_qty);
  var priorPlanned = sadFpVal_(existing.planned_qty);
  var overridden = sadFpVal_(existing.override_reason) !== '' || (priorPlanned !== '' && priorPlanned !== priorRec);
  if (!overridden) {
    var newRec = (incoming.recommended_qty != null && incoming.recommended_qty !== '') ? String(incoming.recommended_qty) : priorRec;
    patch.planned_qty = newRec;                                    // follows the new recommendation
  } // else: preserve the user's planned_qty (omit → no write)
  // note is USER-owned → never overwritten by regeneration (omit)
  return patch;
}

// Private keyed shipping-line upsert core (reached ONLY under lock via the public handler above).
function sadUpsertLinesKeyedCore_(body) {
  var draftId = String((body && body.allocation_draft_id) || '').trim();
  if (!draftId) return jsonResponse_({ success: false, error: 'allocation_draft_id required' });
  var rawLines = (body && body.lines) || [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'shipping_allocation_draft_lines', SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_);
  var now = procurementTimestamp_();
  var created = 0, updated = 0, skipped = 0;

  // Alias-map every line up front, then validate the whole batch BEFORE any write so an incomplete
  // manual line rejects the request with ZERO mutation (System Repair 2 §4/§8; C2-D1R). A soft-cancel line
  // (line_status='cancelled') and a system-generated recommendation snapshot are exempt; only a manual
  // execution line must carry SKU + Qty>0 (route context is HEADER-level in the 28-col line grain).
  // R6F2G (B): the resolved draft id itself is the K2 group authority for this keyed path (a real stored SADH-K2- id,
  // not a caller classification) — a K2 draft heals/mints K2 line ids so no keyed write reintroduces a SADL- line
  // under a K2 header; a generic/legacy draft is unchanged.
  var isK2Draft = (String(draftId).indexOf('SADH-K2-') === 0);
  var lines = [];
  for (var m = 0; m < rawLines.length; m++) lines.push(sadApplyLineAliases_(rawLines[m] || {}));
  for (var v = 0; v < lines.length; v++) {
    var lv = lines[v];
    var isCancelV = String(lv.line_status || '').trim().toLowerCase() === 'cancelled';
    var isSystemV = String(lv.generation_type || '').trim().toLowerCase() === 'system_generated';
    if (isCancelV || isSystemV) continue;
    if (!sadLineIsComplete_(lv)) return jsonResponse_({ success: false, error: 'PLAN_LINE_INCOMPLETE — a manual Execution Plan line requires SKU + Qty>0 (zero rows written); route context is on the Draft header' });
  }

  var EXEC_FIELDS = ['planned_qty', 'override_reason', 'line_status', 'route_no', 'units_per_carton', 'note'];

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var lineId = String(l.allocation_draft_line_id || '').trim();
    // R6F: explicit id match when present; otherwise reconcile a GENERATED line (blank id, keyed by natural key by the
    // KMPR generate path) BY NATURAL KEY so an edit updates that exact row instead of appending a duplicate.
    var found = lineId ? procurementFindRow_(sh, 'allocation_draft_line_id', lineId) : sadFindLineByNaturalKey_(sh, draftId, l);
    // Defensive: a soft-cancel for a line that was never stored (e.g. an incomplete route the user
    // cleared before it was ever persisted) must NOT append a spurious cancelled row — skip it.
    if (!found && String(l.line_status || '').trim().toLowerCase() === 'cancelled') { skipped++; continue; }
    if (found) {
      // Round 1H: NEVER mutate a line-terminal row (submitted/cancelled/superseded) — skip it.
      var cLS = found.col('line_status');
      var curLS = cLS !== -1 ? String(sh.getRange(found.row, cLS + 1).getValue()).trim().toLowerCase() : '';
      if (['submitted', 'cancelled', 'superseded', 'superseded_user_review'].indexOf(curLS) !== -1) { skipped++; continue; }
      // R6F: heal a blank generated-line id with the deterministic SADL id so future edits/readback carry a stable id
      // (idempotent — a nonblank id is never overwritten).
      var cId0 = found.col('allocation_draft_line_id');
      if (cId0 !== -1) { var curId0 = String(sh.getRange(found.row, cId0 + 1).getValue()).trim(); if (!curId0) sh.getRange(found.row, cId0 + 1).setValue(sadNewLineId_(isK2Draft, draftId, l)); }
      function setU(name) { if (l[name] != null) { var c = found.col(name); if (c !== -1) sh.getRange(found.row, c + 1).setValue(String(l[name])); } }
      // Execution-Plan (user) fields — always update when provided.
      EXEC_FIELDS.forEach(setU);
      // Recommendation snapshot — update ONLY when explicitly provided (preserve otherwise).
      SAD_RECOMMENDATION_FIELDS_.forEach(function (f) { if (l[f] != null && l[f] !== '') setU(f); });
      var uc = found.col('updated_at'); if (uc !== -1) sh.getRange(found.row, uc + 1).setValue(now);
      updated++;
    } else {
      // R6F: DETERMINISTIC id (frozen formula) so regeneration/edit of the same logical line reuses the same id
      // (no random-UUID drift, no duplicate on retry). Explicit ids from the frontend are honored as-is for a generic
      // draft; a K2 draft (R6F2G) ALWAYS mints the canonical K2 line id (never trusts an arbitrary caller id).
      if (isK2Draft) lineId = sadK2DeterministicLineId_(draftId, l);
      else if (!lineId) lineId = sadDeterministicLineId_(draftId, l);
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
  return jsonResponse_({ success: true, data: { allocation_draft_id: draftId, line_count: created + updated, created: created, updated: updated, skipped: skipped } });
}

// C2-D1R line completeness (§8) — route context is HEADER-level, so a manual Execution Plan LINE is valid
// with SKU + Qty>0. From/To/Method completeness is enforced on the header via sadHeaderRouteIsComplete_.
function sadLineIsComplete_(l) {
  l = l || {};
  var sku = String(l.sku == null ? '' : l.sku).trim();
  var qty = Number(l.planned_qty); if (isNaN(qty)) qty = 0;
  return !!sku && qty > 0;
}
// Header route completeness (§8, C2-D1R): From + To + Method on the Draft header (recommended_*). An Amazon
// logical destination (destination_marketplace set) counts as a valid To.
function sadHeaderRouteIsComplete_(b) {
  b = b || {};
  var from = String(b.recommended_source_warehouse_id == null ? '' : b.recommended_source_warehouse_id).trim();
  var toReal = String(b.recommended_destination_warehouse_id == null ? '' : b.recommended_destination_warehouse_id).trim();
  var hasTo = !!toReal || !!String(b.destination_marketplace == null ? '' : b.destination_marketplace).trim();
  var method = String(b.recommended_shipping_method == null ? '' : b.recommended_shipping_method).trim();
  var methodOk = !!method && method.toLowerCase().indexOf('no available') === -1;
  return !!from && hasTo && methodOk;
}

// ================================================================================================================
// F1-7N-FA-3C-R6F1 — ATOMIC Header + Lines write (Section C). ONE controlled ScriptLock; validate EVERYTHING before
// the first write; Header + all Lines committed together from the caller's perspective.
//   Body: { header:{...}, lines:[...], expected_draft_version?, enforce_k2_grouping? }
// PRE-WRITE (any failure => ZERO mutation, zero_write:true): both sheet schemas EXACT (30 header / 30 line,
//   order-sensitive — rule 9, no order-agnostic tolerance) · header route-completeness when route intent present ·
//   every manual line complete (SKU + Qty>0) · no duplicate line identity within the batch · FK grouping (all lines
//   belong to this ONE header) · OPTIONAL K2 incompatible-route guard (enforce_k2_grouping:true — the frozen K2
//   contract; OFF by default while live K2 activation is HALTed).
// NEW draft: append Header, then all Lines. If a line write THROWS after a NEW Header was created, COMPENSATE by
//   soft-cancelling (NEVER hard-delete) that exact Header and return COMMITTED_UNVERIFIED + reconciliation evidence —
//   never a generic clean failure.
// EXISTING draft: never delete existing data; a line-write failure fails closed with RECONCILIATION_REQUIRED evidence.
function handleUpsertShippingAllocationDraftAtomic_(body) {
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
  try { return sadAtomicUpsertCore_(body); }
  finally { try { lock.releaseLock(); } catch (e2) { /* best-effort release */ } }
}

// EXACT (order-sensitive) header-row check against a canonical authority. '' when OK, else a reason string. Trailing
// all-blank cells are not real columns. Pure over a sheet-like object exposing getDataRange().getValues().
function sadExactSchemaReason_(sh, authority) {
  var data = sh.getDataRange().getValues();
  var actual = (data && data.length ? data[0] : []).map(function (h) { return String(h == null ? '' : h).trim(); });
  while (actual.length && actual[actual.length - 1] === '') actual.pop();
  if (actual.length !== authority.length) return 'COL_COUNT_' + actual.length + '_EXPECTED_' + authority.length;
  for (var i = 0; i < authority.length; i++) if (actual[i] !== authority[i]) return 'COL' + i + '_IS_' + (actual[i] || '(blank)') + '_EXPECTED_' + authority[i];
  return '';
}

// Pure pre-write validation for the atomic path. Returns { ok:true, lines:[aliased] } or { ok:false, error, stage,
// data? }. No sheet access, no mutation. `existingHeaders` = { drafts:[...], lines:[...] } actual header rows (for the
// EXACT schema check); when omitted the schema check is skipped (caller validated it).
function sadAtomicValidateBatch_(header, rawLines, enforceK2) {
  header = header || {};
  var status = String(header.status || 'draft').trim(); if (!SAD_STATUSES_[status]) status = 'draft';
  var hasRouteIntent = !!(String(header.recommended_source_warehouse_id || '').trim() ||
    String(header.recommended_shipping_method || '').trim() || String(header.recommended_destination_warehouse_id || '').trim());
  if (hasRouteIntent && status !== 'cancelled' && !sadHeaderRouteIsComplete_(header)) {
    return { ok: false, stage: 'header', error: 'PLAN_HEADER_INCOMPLETE — route requires From + To + Method (zero rows written)' };
  }
  var lines = [], seen = {};
  for (var i = 0; i < (rawLines || []).length; i++) {
    var l = sadApplyLineAliases_(rawLines[i] || {});
    var isCancel = String(l.line_status || '').trim().toLowerCase() === 'cancelled';
    var isSystem = String(l.generation_type || '').trim().toLowerCase() === 'system_generated';
    if (!isCancel && !isSystem && !sadLineIsComplete_(l)) return { ok: false, stage: 'lines', error: 'PLAN_LINE_INCOMPLETE — a manual line requires SKU + Qty>0 (zero rows written)' };
    var lineId = String(l.allocation_draft_line_id || '').trim();
    var nk = lineId || sadLineNaturalKey_('__ATOMIC__', l);
    if (seen[nk]) return { ok: false, stage: 'lines', error: 'DUPLICATE_LINE_IN_BATCH — two lines resolve to the same identity (zero rows written): ' + nk };
    seen[nk] = 1;
    lines.push(l);
  }
  if (enforceK2 === true) {
    var g = sadK2LinesRouteCompatibleWithHeader_(header, lines);
    if (!g.compatible) return { ok: false, stage: 'grouping', error: 'K2_ROUTE_INCOMPATIBLE — a line carries route values incompatible with the header shipment group (zero rows written)', data: { violations: g.violations } };
  }
  return { ok: true, lines: lines };
}

function sadAtomicUpsertCore_(body) {
  body = body || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var header = body.header || {};

  // ensure both sheets, then validate BOTH schemas EXACT (rule 9 — no order-agnostic tolerance).
  var hSh = procurementEnsureSheet_(ss, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
  var lSh = procurementEnsureSheet_(ss, 'shipping_allocation_draft_lines', SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_);
  var hR = sadExactSchemaReason_(hSh, SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
  if (hR) return jsonResponse_({ success: false, error: 'SCHEMA_MISMATCH [shipping_allocation_drafts] ' + hR, stage: 'schema', zero_write: true });
  var lR = sadExactSchemaReason_(lSh, SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_);
  if (lR) return jsonResponse_({ success: false, error: 'SCHEMA_MISMATCH [shipping_allocation_draft_lines] ' + lR, stage: 'schema', zero_write: true });

  // pure batch validation (header completeness + line completeness + batch dedup + optional K2 guard).
  var vb = sadAtomicValidateBatch_(header, body.lines || [], body.enforce_k2_grouping === true);
  if (!vb.ok) return jsonResponse_({ success: false, error: vb.error, stage: vb.stage, zero_write: true, data: vb.data || null });
  var lines = vb.lines;

  // resolve the header id: explicit id, else the UNIFIED K2-or-K3 active-draft resolution (R6F2) — a route-complete
  // header keys on the 10-dim K2 group identity (CREATE returns the deterministic SADH-K2- id); a no-route scratchpad
  // falls back to K3. Fail closed on CONFLICT with ZERO mutation. This is the SAME identity generation uses.
  var allowReconcile = (body.allow_legacy_reconcile === true);
  var id = String(header.allocation_draft_id || '').trim();
  var found = id ? procurementFindRow_(hSh, 'allocation_draft_id', id) : null;
  // R6F2G (B): K2 group classification from the resolver's authoritative decision (CREATE/REUSE), else — for an
  // explicit-id edit — from the header's own group authority. Drives the K2-aware NEW-line id scheme below.
  var isK2Group = id ? sadIsK2Group_(undefined, id, header) : false;
  if (!id) {
    var res = sadResolveActiveDraftK2OrK3_(hSh, header, { allowLegacyReconcile: allowReconcile });
    if (res.status === 'CONFLICT') return jsonResponse_({ success: false, error: 'BLOCKED_CONFLICT — more than one Active Draft for this ' + (res.k2 ? 'shipment group (K2)' : 'scope (K3)') + ' (zero rows written)', stage: 'header', zero_write: true, data: { conflictIds: res.conflictIds, k2: res.k2 } });
    if (res.status === 'BLOCK') return jsonResponse_({ success: false, error: res.reason + ' — ' + (res.reason === 'ROUTE_INCOMPLETE_NEW_DRAFT' ? 'a new Draft requires a COMPLETE route (From+To+Method); no K3 header is created for a missing route' : 'this scope has an existing route-incomplete/legacy Draft — reconcile it via an explicit USER migration') + ' (zero rows written)', stage: 'header', zero_write: true, data: { reason: res.reason, existing_id: res.id || null } });
    isK2Group = sadIsK2Group_(res.k2, res.id, header);
    if (res.status === 'REUSE') { id = res.id; found = procurementFindRow_(hSh, 'allocation_draft_id', id); }
    else if (res.status === 'CREATE' && res.id) { id = res.id; }   // K2 deterministic id → INSERT with it (found stays null)
  }
  if (found) {
    var cS = found.col('status'); var st = cS !== -1 ? String(hSh.getRange(found.row, cS + 1).getValue()).trim().toLowerCase() : '';
    if (st === 'submitted' || st === 'cancelled') return jsonResponse_({ success: false, error: 'IMMUTABLE_TERMINAL_STATUS:' + st, stage: 'terminal', zero_write: true });
    // A: editing an existing route-INCOMPLETE (legacy) row is fail-closed unless an explicit USER migration is requested.
    var legR = sadLegacyReconcileReason_(hSh, found, allowReconcile);
    if (legR) return jsonResponse_({ success: false, error: legR + ' — ' + sadReconcileMessage_(legR) + ' (zero rows written)', stage: 'header', zero_write: true, data: { reason: legR, existing_id: id } });
  }

  var now = procurementTimestamp_();
  var actor = String(header.created_by || 'inventory-replenishment').trim();
  var status = String(header.status || 'draft').trim(); if (!SAD_STATUSES_[status]) status = 'draft';
  var newHeaderCreated = false;

  // ---- F1-7N-FA-3C-R6F2A (B): REUSE vs REGENERATE vs CONFLICT for an existing K2 group ----------------------
  var outcome = 'CREATE', priorVersion = '', nextVersion = '';
  if (found) {
    var priorHeaderObj = sadRowToObject_(hSh, found.row);
    priorVersion = sadFpVal_(priorHeaderObj.draft_version);
    // optimistic token (stale → CONFLICT, zero write)
    if (header.expected_draft_version != null && sadFpVal_(header.expected_draft_version) !== priorVersion) {
      return jsonResponse_({ success: false, error: 'STALE_OPTIMISTIC_TOKEN — expected draft_version ' + sadFpVal_(header.expected_draft_version) + ' but current is ' + priorVersion + ' (zero rows written)', stage: 'conflict', zero_write: true, data: { expected: sadFpVal_(header.expected_draft_version), current: priorVersion } });
    }
    var priorLines = sadReadLinesForDraft_(lSh, id);
    var priorFp = sadK2PayloadFingerprint_(priorHeaderObj, priorLines);
    var incFp = sadK2PayloadFingerprint_(header, lines);
    // R6F2G6 — REUSE (zero write) when the raw fingerprints match OR the payload is representation-equivalent (a
    // Sheets Date/number coercion is NOT a content change). Both return BEFORE the first business-table mutation.
    if (priorFp === incFp || sadK2SemanticPayloadEqual_(priorHeaderObj, priorLines, header, lines)) {
      return jsonResponse_({ success: true, reused: true, data: { allocation_draft_id: id, outcome: 'REUSED', draft_version: priorVersion, line_count: priorLines.length, zero_write: true, reuse_basis: (priorFp === incFp ? 'FINGERPRINT_EQUAL' : 'SEMANTIC_EQUIVALENT@' + SAD_K2_SEM_CONTRACT_) } });
    }
    outcome = 'REGENERATE';
    nextVersion = String((parseInt(priorVersion, 10) || 1) + 1);   // increment EXACTLY once
  }

  // ---- WRITE PHASE (header first, then all lines) — one lock is already held by the public handler ------------
  if (found) {
    (function () {
      function setCol(name, val) { var c = found.col(name); if (c !== -1) hSh.getRange(found.row, c + 1).setValue(val); }
      setCol('status', status);
      ['recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_source_warehouse_code_snapshot',
        'recommended_destination_warehouse_code_snapshot', 'recommendation_group_no', 'recommended_shipping_method',
        'recommended_last_mile_delivery'].forEach(function (f) { if (header[f] != null) setCol(f, String(header[f])); });
      // REGENERATE: adopt new calculation evidence + bump draft_version EXACTLY once. note is USER-owned (not overwritten).
      ['calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of'].forEach(function (f) { if (header[f] != null && String(header[f]).trim() !== '') setCol(f, String(header[f])); });
      if (nextVersion) setCol('draft_version', nextVersion);
      setCol('updated_by', actor); setCol('updated_at', now);
    })();
  } else {
    if (!id) id = 'SAD-' + Utilities.getUuid().substring(0, 10).toUpperCase();
    procurementAppendByHeader_(hSh, {
      allocation_draft_id: id, planning_cycle: String(header.planning_cycle || '').trim(),
      source_page: String(header.source_page || 'inventory_replenishment').trim(),
      company: String(header.company || '').trim(), country: String(header.country || '').trim(),
      marketplace: String(header.marketplace || '').trim(), status: status,
      recommended_source_warehouse_id: String(header.recommended_source_warehouse_id || '').trim(),
      recommended_destination_warehouse_id: String(header.recommended_destination_warehouse_id || '').trim(),
      recommended_source_warehouse_code_snapshot: String(header.recommended_source_warehouse_code_snapshot || '').trim(),
      recommended_destination_warehouse_code_snapshot: String(header.recommended_destination_warehouse_code_snapshot || '').trim(),
      recommendation_group_no: String(header.recommendation_group_no || '').trim(),
      recommended_shipping_method: String(header.recommended_shipping_method || '').trim(),
      recommended_last_mile_delivery: String(header.recommended_last_mile_delivery || '').trim(),
      generation_type: String(header.generation_type || 'user_created').trim(),
      calculation_run_id: String(header.calculation_run_id || '').trim(),
      formula_version: String(header.formula_version || '').trim(),
      calculated_at: String(header.calculated_at || '').trim(),
      source_data_as_of: String(header.source_data_as_of || '').trim(),
      draft_version: String(header.draft_version || '1').trim(),
      created_by: actor, created_at: now, updated_by: actor, updated_at: now,
      submitted_by: '', submitted_at: '', cancelled_by: '', cancelled_at: '', cancel_reason: '',
      note: String(header.note || '').trim()
    });
    newHeaderCreated = true;
  }

  // lines — reuse the frozen per-line contract (heal blank id / EXEC_FIELDS / deterministic insert / terminal-skip),
  // mirroring sadUpsertLinesKeyedCore_. Wrapped so a write throw AFTER a new header triggers compensation.
  var created = 0, updated = 0, skipped = 0, writeErr = null;
  try {
    var EXEC_FIELDS = ['planned_qty', 'override_reason', 'line_status', 'route_no', 'units_per_carton', 'note'];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      var lineId = String(l.allocation_draft_line_id || '').trim();
      var lf = lineId ? procurementFindRow_(lSh, 'allocation_draft_line_id', lineId) : sadFindLineByNaturalKey_(lSh, id, l);
      if (!lf && String(l.line_status || '').trim().toLowerCase() === 'cancelled') { skipped++; continue; }
      if (lf) {
        var cLS = lf.col('line_status'); var curLS = cLS !== -1 ? String(lSh.getRange(lf.row, cLS + 1).getValue()).trim().toLowerCase() : '';
        if (['submitted', 'cancelled', 'superseded', 'superseded_user_review'].indexOf(curLS) !== -1) { skipped++; continue; }
        var cId0 = lf.col('allocation_draft_line_id');
        if (cId0 !== -1) { var curId0 = String(lSh.getRange(lf.row, cId0 + 1).getValue()).trim(); if (!curId0) lSh.getRange(lf.row, cId0 + 1).setValue(sadNewLineId_(isK2Group, id, l)); }
        (function (found2, line) {
          function put(name, val) { var c = found2.col(name); if (c !== -1) lSh.getRange(found2.row, c + 1).setValue(String(val)); }
          if (outcome === 'REGENERATE') {
            // C: system fields adopted; planned_qty per ownership; note + user override PRESERVED (never restore an old AI note).
            var patch = sadRegenerateLinePatch_(sadRowToObject_(lSh, found2.row), line);
            for (var pk in patch) if (patch.hasOwnProperty(pk)) put(pk, patch[pk]);
          } else {
            // manual edit through the atomic endpoint: the user's Execution-Plan fields overwrite when provided.
            EXEC_FIELDS.forEach(function (name) { if (line[name] != null) put(name, line[name]); });
            SAD_RECOMMENDATION_FIELDS_.forEach(function (f) { if (line[f] != null && line[f] !== '') put(f, line[f]); });
          }
          var uc = found2.col('updated_at'); if (uc !== -1) lSh.getRange(found2.row, uc + 1).setValue(now);
        })(lf, l);
        updated++;
      } else {
        // R6F2G (B): a K2 group ALWAYS mints the canonical K2 line id from the natural key (a caller-supplied arbitrary
        // id is never trusted to name a new K2 line); a generic/legacy draft honors an explicit id, else mints SADL-.
        if (isK2Group) lineId = sadK2DeterministicLineId_(id, l);
        else if (!lineId) lineId = sadDeterministicLineId_(id, l);
        var recQty = (l.recommended_qty != null && l.recommended_qty !== '') ? procurementNum_(l.recommended_qty) : '';
        var planned = (l.planned_qty != null && l.planned_qty !== '') ? procurementNum_(l.planned_qty) : (recQty !== '' ? recQty : '');
        var rowObj = { allocation_draft_line_id: lineId, allocation_draft_id: id, created_at: now, updated_at: now, planned_qty: planned, recommended_qty: recQty };
        SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_.forEach(function (h) { if (h in rowObj) return; if (l[h] != null) rowObj[h] = String(l[h]); });
        procurementAppendByHeader_(lSh, rowObj);
        created++;
      }
    }
  } catch (e3) { writeErr = e3; }

  if (writeErr) {
    if (newHeaderCreated) {
      // COMPENSATE the just-created header (soft-cancel; NEVER hard-delete) + COMMITTED_UNVERIFIED.
      var cf = procurementFindRow_(hSh, 'allocation_draft_id', id);
      if (cf) { (function () { function setC(n, v) { var c = cf.col(n); if (c !== -1) hSh.getRange(cf.row, c + 1).setValue(v); } setC('status', 'cancelled'); setC('cancelled_by', actor); setC('cancelled_at', now); setC('cancel_reason', 'R6F1_ATOMIC_COMPENSATION_LINE_WRITE_FAILED'); setC('updated_at', now); })(); }
      return jsonResponse_({ success: false, error: 'COMMITTED_UNVERIFIED — new Header created then a line write failed; the exact Header was soft-cancelled for audit (no hard delete). ' + (writeErr.message || writeErr), stage: 'lines', data: { allocation_draft_id: id, compensated: true, lines_committed: created + updated } });
    }
    return jsonResponse_({ success: false, error: 'RECONCILIATION_REQUIRED — existing Draft; a line write failed and existing data was preserved (no delete). ' + (writeErr.message || writeErr), stage: 'lines', data: { allocation_draft_id: id, lines_committed: created + updated } });
  }
  return jsonResponse_({ success: true, data: { allocation_draft_id: id, outcome: (newHeaderCreated ? 'CREATED' : 'REGENERATED'), created_header: newHeaderCreated, draft_version: (nextVersion || (found ? priorVersion : String(header.draft_version || '1').trim())), line_count: created + updated, created: created, updated: updated, skipped: skipped } });
}

// ---- submitShippingAllocationDrafts (DEPRECATED alias) ------------
// F1-7N-FA-4B — the status-only "mark submitted" stub is RETIRED as an independent boundary. There is exactly ONE
// production Submit authority: handleSubmitAllocationDraftsToShippingPlans_. This name is kept only as a deprecated
// compatibility alias that DELEGATES to the canonical authority (which now creates the Weekly Shipping Plan and
// transitions the drafts atomically, instead of merely stamping status). No UI caller exists; remove after controlled
// live validation.
function handleSubmitShippingAllocationDrafts_(body) {
  body = body || {};
  return handleSubmitAllocationDraftsToShippingPlans_({ allocation_draft_ids: body.allocation_draft_ids || body.draft_ids || [],
    expected_versions: body.expected_versions, execution_key: body.execution_key || body.submit_batch_id, submitted_by: body.submitted_by,
    source: body.source, _deprecated_alias: 'submitShippingAllocationDrafts' });
}

// ============================================================
// F1-7N-FA-4B — THE canonical Inventory AI Plan Submit authority: shipping_allocation_drafts → Weekly Shipping Plan.
// SERVER-OWNED: re-reads shipping_allocation_drafts + shipping_allocation_draft_lines (NEVER trusts frontend-authored
// plan lines), validates, derives the shipping-plan payload from the persisted drafts, and delegates the WRITE to the
// single shipping_plans authority shippingPlanCommitFromLines_ (11_). Idempotent (execution key), ScriptLock-serialized,
// readback-verified. Drafts transition to `submitted` ONLY after the plan is durably committed and read back. Does NOT
// create shipments (Shipping Plan → Shipment remains a later approval boundary). Body:
//   { allocation_draft_ids:[], expected_versions?:{id:draft_version}, execution_key?, submitted_by?, source? }
// ============================================================
function handleSubmitAllocationDraftsToShippingPlans_(body) {
  body = body || {};
  var ids = (body.allocation_draft_ids || body.draft_ids || []).map(function (x) { return String(x || '').trim(); }).filter(String);
  if (!ids.length) return jsonResponse_({ success: false, error: 'allocation_draft_ids required', code: 'INPUT_MISSING_DRAFT_IDS', stage: 'input', zero_write: true });
  var lock = LockService.getScriptLock(), locked = false;
  try { locked = lock.tryLock(30000); } catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), code: 'LOCK_ERROR', stage: 'lock', zero_write: true }); }
  if (!locked) return jsonResponse_({ success: false, error: 'IN_PROGRESS_SAME_EXECUTION_KEY — another Submit is in progress for this scope; read back by execution key rather than retrying.', code: 'IN_PROGRESS_SAME_EXECUTION_KEY', stage: 'lock', zero_write: true, data: { allocation_draft_ids: ids } });
  try { return jsonResponse_(sadSubmitToShippingPlansCore_(SpreadsheetApp.getActiveSpreadsheet(), body, ids)); }
  finally { try { lock.releaseLock(); } catch (e2) { /* best-effort */ } }
}

// PURE-ish orchestration core (assumes the caller holds the ScriptLock). Returns a PLAIN result object.
function sadSubmitToShippingPlansCore_(ss, body, ids) {
  var hSh = procurementEnsureSheet_(ss, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
  var lSh = procurementEnsureSheet_(ss, 'shipping_allocation_draft_lines', SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_);
  var expectedVersions = body.expected_versions || {};
  var submittedBy = String(body.submitted_by || 'inventory-replenishment').trim();
  var source = String(body.source || 'inventory_ai_plan_submit').trim();
  var execKey = String(body.execution_key || body.submit_batch_id || '').trim();
  if (!execKey) execKey = 'SADSUB-' + sadFnv1a_(ids.slice().sort().join('|') + '::' + ids.slice().sort().map(function (id) { return String((expectedVersions || {})[id] == null ? '' : expectedVersions[id]); }).join('|')).toUpperCase();

  // ---- READ + VALIDATE every requested draft server-side (13-point gate; NEVER trust the frontend) ------
  var drafts = [], toTransition = [], alreadySubmitted = [], errors = [];
  var seenLineIds = {}, natKeys = {};
  ids.forEach(function (id) {
    var found = procurementFindRow_(hSh, 'allocation_draft_id', id);
    if (!found) { errors.push({ allocation_draft_id: id, reason: 'HEADER_NOT_FOUND' }); return; }              // (1) exact header exists
    var header = sadRowToObject_(hSh, found.row);
    var status = String(header.status || '').trim().toLowerCase();
    var isSubmitted = (status === 'submitted');
    if (status === 'cancelled') { errors.push({ allocation_draft_id: id, reason: 'DRAFT_CANCELLED' }); return; } // (13) not terminal-cancelled
    if (!isSubmitted && status !== 'draft' && status !== 'site_confirmed' && status !== 'partially_submitted') { errors.push({ allocation_draft_id: id, reason: 'STATUS_NOT_SUBMITTABLE:' + status }); return; } // (2)
    if (!isSubmitted && expectedVersions && expectedVersions[id] != null && String(expectedVersions[id]).trim() !== String(header.draft_version == null ? '' : header.draft_version).trim()) { errors.push({ allocation_draft_id: id, reason: 'STALE_VERSION', expected: String(expectedVersions[id]), current: String(header.draft_version) }); return; } // (12)
    if (!String(header.planning_cycle || '').trim()) { errors.push({ allocation_draft_id: id, reason: 'PLANNING_CYCLE_MISSING' }); return; } // (10)
    if (!isSubmitted && !sadHeaderRouteIsComplete_(header)) { errors.push({ allocation_draft_id: id, reason: 'ROUTE_INCOMPLETE' }); return; }   // (9) complete route (K2-aware)
    if (!String(header.calculation_run_id || '').trim() || !String(header.formula_version || '').trim()) { errors.push({ allocation_draft_id: id, reason: 'LINEAGE_INCOMPLETE' }); return; } // (11)
    var lines = sadReadLinesForDraft_(lSh, id);
    if (!lines.length) { errors.push({ allocation_draft_id: id, reason: 'NO_LINES' }); return; }                // (3) exact linked lines
    var lineErr = null, shippable = [];
    for (var j = 0; j < lines.length; j++) {
      var ln = lines[j], lineId = String(ln.allocation_draft_line_id || '').trim();
      if (!lineId) { lineErr = 'LINE_ID_MISSING'; break; }
      if (seenLineIds[lineId]) { lineErr = 'DUPLICATE_LINE_ID:' + lineId; break; }                              // (5) no duplicate line ids
      seenLineIds[lineId] = 1;
      if (String(ln.allocation_draft_id || '').trim() !== id) { lineErr = 'FK_MISMATCH:' + lineId; break; }     // (4) FK integrity
      if (String(ln.line_status || '').trim().toLowerCase() === 'cancelled') continue;                          // (8) non-cancelled only
      var nat = [id, String(ln.sku || '').trim().toLowerCase(), String(ln.site_sku || '').trim().toLowerCase(), String(ln.window_code || '').trim().toLowerCase()].join('|');
      if (natKeys[nat]) { lineErr = 'DUPLICATE_NATURAL_KEY:' + nat; break; }                                    // (6) no duplicate natural keys
      natKeys[nat] = 1;
      var qty = Number(String(ln.planned_qty == null ? '' : ln.planned_qty).trim());
      if (!isFinite(qty) || qty <= 0) continue;                                                                 // (7) positive qty (0 → not shipped)
      shippable.push(ln);
    }
    if (lineErr) { errors.push({ allocation_draft_id: id, reason: lineErr }); return; }
    if (!shippable.length) { errors.push({ allocation_draft_id: id, reason: 'NO_POSITIVE_PLANNED_QTY_LINES' }); return; }
    drafts.push({ id: id, header: header, lines: shippable });
    if (isSubmitted) alreadySubmitted.push(id); else toTransition.push(id);
  });
  if (errors.length) return { success: false, error: 'SUBMIT_VALIDATION_FAILED', code: 'SUBMIT_VALIDATION_FAILED', stage: 'validation', zero_write: true, data: { execution_key: execKey, errors: errors.slice(0, 25) } };

  // already-submitted drafts may only be replayed as an IDEMPOTENT reuse of the SAME execution-key plan; a new key over
  // already-submitted drafts is a CONFLICT (no double submit). (13) no already-submitted conflicting lineage.
  // read-only shipping_plans lookup (never ENSURE here — the shipping_plans WRITE authority lives in 11_).
  if (alreadySubmitted.length) {
    var planSheet0 = ss.getSheetByName('shipping_plans');
    var keyPlans0 = planSheet0 ? shippingPlanReadObjects_(planSheet0).filter(function (p) { return String(p.submit_batch_id || '').trim() === execKey; }) : [];
    if (!keyPlans0.length) return { success: false, error: 'SUBMIT_DRAFT_ALREADY_SUBMITTED', code: 'CONFLICT', stage: 'validation', zero_write: true, data: { execution_key: execKey, already_submitted: alreadySubmitted } };
  }

  // ---- DERIVE the normalized shipping-plan lines[] from ALL persisted drafts (server-owned; stable fingerprint) ---
  var submitLines = [];
  drafts.forEach(function (d) {
    var h = d.header;
    var shipFrom = String(h.recommended_source_warehouse_code_snapshot || h.recommended_source_warehouse_id || '').trim();
    var destWhId = String(h.recommended_destination_warehouse_id || '').trim();
    var destination = String(h.recommended_destination_warehouse_code_snapshot || destWhId || h.marketplace || '').trim();
    var lineageBase = 'allocation_draft:' + d.id + '|run:' + String(h.calculation_run_id || '').trim() + '|fv:' + String(h.formula_version || '').trim() + '|cyc:' + String(h.planning_cycle || '').trim();
    d.lines.forEach(function (ln) {
      submitLines.push({
        company: h.company, country: h.country, marketplace: h.marketplace,
        ship_from: shipFrom, source_warehouse_id: String(ln.source_warehouse_id || h.recommended_source_warehouse_id || '').trim(), ship_from_type: 'warehouse',
        destination: destination, destination_warehouse_id: destWhId, destination_type: destWhId ? 'warehouse' : 'marketplace',
        shipping_method: h.recommended_shipping_method, last_mile_delivery: h.recommended_last_mile_delivery, carrier_id: '', customs_type: '',
        planning_cycle: String(h.planning_cycle || '').trim(),   // F1-7N-FA-4B2(A): a grouping dimension (also fingerprint-bound via source_reason cyc:)
        sku: ln.sku, site_sku: ln.site_sku, requested_qty: ln.planned_qty, units_per_carton: ln.units_per_carton,
        source_page: String(h.source_page || 'inventory_replenishment').trim(),
        source_reason: lineageBase + '|line:' + String(ln.allocation_draft_line_id || '').trim(),
        inventory_snapshot_date: String(h.source_data_as_of || '').trim()
      });
    });
  });

  // G — capture the EXACT before-state of every draft this execution will transition (durable rollback evidence +
  // in-execution restore). Only the cells this execution writes are captured (status/audit/note + draft_version).
  var draftBefore = {};
  toTransition.forEach(function (id) {
    var d0 = drafts.filter(function (x) { return x.id === id; })[0], h0 = d0 ? d0.header : {};
    draftBefore[id] = { status: String(h0.status == null ? '' : h0.status), submitted_by: String(h0.submitted_by == null ? '' : h0.submitted_by), submitted_at: String(h0.submitted_at == null ? '' : h0.submitted_at), updated_by: String(h0.updated_by == null ? '' : h0.updated_by), updated_at: String(h0.updated_at == null ? '' : h0.updated_at), note: String(h0.note == null ? '' : h0.note), draft_version: String(h0.draft_version == null ? '' : h0.draft_version) };
  });

  // ---- WRITE via the SINGLE shipping_plans authority (idempotent + durable-journal + readback-verified inside the core).
  // journalExtra binds the affected draft ids + before-state into the writer's durable rollback evidence (phase 1).
  var commit = shippingPlanCommitFromLines_(ss, submitLines, { source: source, createdBy: submittedBy, providedKey: execKey,
    journalExtra: { affected_draft_ids: toTransition.slice(), draft_before: draftBefore } });
  if (!commit.success) { commit.data = commit.data || {}; commit.data.execution_key = execKey; commit.data.drafts_unsubmitted = toTransition.slice(); return commit; }   // downstream failed → drafts stay unsubmitted

  // ---- TRANSITION not-yet-submitted drafts → submitted (ONLY after durable plan commit) + readback ------
  var now = procurementTimestamp_();
  var planIds = ((commit.data && commit.data.plans) || []).map(function (p) { return typeof p === 'string' ? p : String(p.shipping_plan_id || '').trim(); }).filter(String);
  var planTag = planIds.join(',');
  toTransition.forEach(function (id) {
    var f = procurementFindRow_(hSh, 'allocation_draft_id', id); if (!f) return;
    var prevNote = String(sadRowToObject_(hSh, f.row).note || '').trim();
    function setCol(name, val) { var c = f.col(name); if (c !== -1) hSh.getRange(f.row, c + 1).setValue(val); }
    setCol('status', 'submitted'); setCol('submitted_by', submittedBy); setCol('submitted_at', now); setCol('updated_by', submittedBy); setCol('updated_at', now);
    var appended = '[SUBMITTED @' + now + ' → shipping_plan ' + (planTag || '(reused)') + ' · exec ' + execKey + ']';
    setCol('note', prevNote ? (prevNote + '\n' + appended) : appended);
  });
  SpreadsheetApp.flush();
  var unverified = [];
  toTransition.forEach(function (id) { var f = procurementFindRow_(hSh, 'allocation_draft_id', id); if (!f || String(sadRowToObject_(hSh, f.row).status || '').trim().toLowerCase() !== 'submitted') unverified.push(id); });
  if (unverified.length) {
    // G — POSTCHECK failure: restore ONLY the draft cells this execution changed, AND roll back the committed plan rows
    // (inserted-only, reverse-FK) so we never leave a submitted draft without a verified plan, nor a plan behind.
    toTransition.forEach(function (id) {
      var fr = procurementFindRow_(hSh, 'allocation_draft_id', id); if (!fr) return; var b = draftBefore[id] || {};
      function setCol2(name, val) { var c = fr.col(name); if (c !== -1) hSh.getRange(fr.row, c + 1).setValue(val); }
      ['status', 'submitted_by', 'submitted_at', 'updated_by', 'updated_at', 'note'].forEach(function (k) { setCol2(k, b[k] == null ? '' : b[k]); });
    });
    var planRb = shippingPlanRollbackBatch_(ss, execKey, planIds);
    SpreadsheetApp.flush();
    var restoreOk = true;
    toTransition.forEach(function (id) { var fr2 = procurementFindRow_(hSh, 'allocation_draft_id', id); if (fr2 && String(sadRowToObject_(hSh, fr2.row).status || '').trim().toLowerCase() === 'submitted') restoreOk = false; });
    var rolledOk = planRb.ok && restoreOk;
    return { success: false, error: rolledOk ? 'POSTCHECK_FAILED_ROLLED_BACK' : 'POSTCHECK_FAILED_ROLLBACK_UNVERIFIED', code: rolledOk ? 'POSTCHECK_FAILED_ROLLED_BACK' : 'POSTCHECK_FAILED_ROLLBACK_UNVERIFIED', stage: 'draft_transition', zero_write: rolledOk, data: { execution_key: execKey, outcome: commit.data.outcome, plans_rolled_back: planIds, unverified_drafts: unverified, plan_rollback: planRb, draft_restore_ok: restoreOk } };
  }

  return { success: true, data: { execution_key: execKey, outcome: commit.data.outcome, reused: !!commit.data.reused,
    plan_count: (commit.data.plan_count || planIds.length), line_count: (commit.data.line_count || submitLines.length), plans: planIds,
    submitted_drafts: toTransition.slice(), already_submitted: alreadySubmitted,
    lineage: drafts.map(function (d) { return { allocation_draft_id: d.id, calculation_run_id: String(d.header.calculation_run_id || '').trim(), formula_version: String(d.header.formula_version || '').trim(), calculated_at: String(d.header.calculated_at || '').trim(), source_data_as_of: String(d.header.source_data_as_of || '').trim(), planning_cycle: String(d.header.planning_cycle || '').trim() }; }) } };
}

// ============================================================
// C2-D2 — K3 Active-Draft resolver + targeted read-only readback + whole-Draft Cancel.
// The Submit → shipping_plans / shipping_plan_lines handoff is DEFERRED (HALT): the source-availability /
// L2 commitment authority is unresolved in source/spec, createShippingPlansBatch produces random-UUID (non
// deterministic) downstream IDs, and idempotent retry would require a NEW allocation_draft lineage column on
// shipping_plans (prohibited). See docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md.
// ============================================================

// Centralized K3 Active-Draft resolver (single lookup rule for Save / Cancel / Readback). Active = status not
// submitted/cancelled matching the K3 scope (planning_cycle + company + country + marketplace + source_page) —
// NEVER draft_version, NEVER recommendation_group_no. Returns
//   { status:'NO_ACTIVE_DRAFT'|'ACTIVE_DRAFT_FOUND'|'BLOCKED_CONFLICT', id, row, conflictIds }.
function sadResolveActiveDraft_(sh, scope) {
  scope = scope || {};
  var want = {
    pc: String(scope.planning_cycle == null ? '' : scope.planning_cycle).trim(),
    co: String(scope.company == null ? '' : scope.company).trim(),
    cy: String(scope.country == null ? '' : scope.country).trim(),
    mk: String(scope.marketplace == null ? '' : scope.marketplace).trim(),
    sp: String(scope.source_page == null || scope.source_page === '' ? 'inventory_replenishment' : scope.source_page).trim()
  };
  var empty = { status: 'NO_ACTIVE_DRAFT', id: '', row: 0, conflictIds: [] };
  if (!want.pc) return empty;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return empty;
  var h = data[0].map(function (x) { return String(x).trim(); });
  var ci = { pc: h.indexOf('planning_cycle'), co: h.indexOf('company'), cy: h.indexOf('country'),
    mk: h.indexOf('marketplace'), sp: h.indexOf('source_page'), st: h.indexOf('status'), id: h.indexOf('allocation_draft_id') };
  var matches = [];
  for (var r = 1; r < data.length; r++) {
    var st = String(data[r][ci.st] == null ? '' : data[r][ci.st]).trim().toLowerCase();
    if (st === 'submitted' || st === 'cancelled') continue;   // active = not terminal
    if (String(data[r][ci.pc]).trim() === want.pc && String(data[r][ci.co]).trim() === want.co &&
        String(data[r][ci.cy]).trim() === want.cy && String(data[r][ci.mk]).trim() === want.mk &&
        String(data[r][ci.sp]).trim() === want.sp) {
      matches.push({ id: String(data[r][ci.id]).trim(), row: r + 1 });
    }
  }
  if (!matches.length) return empty;
  if (matches.length > 1) return { status: 'BLOCKED_CONFLICT', id: '', row: 0, conflictIds: matches.map(function (m) { return m.id; }) };
  return { status: 'ACTIVE_DRAFT_FOUND', id: matches[0].id, row: matches[0].row, conflictIds: [] };
}

// F1-7N-FA-3C-R6F2 — read ACTIVE (draft/site_confirmed/partially_submitted) header rows as objects (read-only) for
// K2 CREATE/REUSE/CONFLICT resolution.
function sadReadActiveHeaderRows_(sh) {
  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (x) { return String(x).trim(); });
  var cStatus = headers.indexOf('status');
  var ACTIVE = { draft: 1, site_confirmed: 1, partially_submitted: 1 };
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var st = cStatus !== -1 ? String(data[r][cStatus]).trim().toLowerCase() : '';
    if (!ACTIVE[st]) continue;
    var o = {}; for (var c = 0; c < headers.length; c++) if (headers[c]) o[headers[c]] = data[r][c];
    o.status = st;
    out.push(o);
  }
  return out;
}

// F1-7N-FA-3C-R6F2 — the SINGLE active-draft resolution used by BOTH generation (atomic endpoint) AND manual save.
// A COMPLETE route (From+To+Method present) resolves by the 10-dim K2 group key (route-level identity);
// a no-route scratchpad falls back to the landed K3 scope. Returns { status:'CREATE'|'REUSE'|'CONFLICT', id,
// conflictIds, k2:bool }. CREATE under K2 returns the DETERMINISTIC header id (SADH-K2-…); CREATE under K3 returns ''.
// F1-7N-FA-3C-R6F2A (A — NO NEW K3 WRITES): route-complete → K2 (CREATE deterministic id / REUSE / CONFLICT). A
// route-INCOMPLETE new Draft NEVER creates a K3 header: if it would match an EXISTING active K3 row, editing that
// legacy row is fail-closed with LEGACY_ROUTE_RECONCILIATION_REQUIRED (unless opts.allowLegacyReconcile — a separate,
// explicit, USER-owned migration); otherwise the new write is BLOCKed with ROUTE_INCOMPLETE_NEW_DRAFT. Legacy K3 rows
// may be READ (readback/cancel) but never become the identity of a new K2 write.
// Returns { status:'CREATE'|'REUSE'|'CONFLICT'|'BLOCK', reason?, id, conflictIds, k2:bool, legacyReconcile? }.
function sadResolveActiveDraftK2OrK3_(sh, header, opts) {
  header = header || {}; opts = opts || {};
  if (sadHeaderRouteIsComplete_(header)) {
    var r = sadK2ResolveActiveDraft_(sadReadActiveHeaderRows_(sh), header);
    if (r.status === 'CREATE') return { status: 'CREATE', id: r.allocation_draft_id, conflictIds: [], k2: true };
    if (r.status === 'REUSE') return { status: 'REUSE', id: r.allocation_draft_id, conflictIds: [], k2: true };
    return { status: 'CONFLICT', id: '', conflictIds: r.conflictIds || [], k2: true };
  }
  var k3 = sadResolveActiveDraft_(sh, { planning_cycle: header.planning_cycle, company: header.company,
    country: header.country, marketplace: header.marketplace, source_page: header.source_page });
  if (k3.status === 'BLOCKED_CONFLICT') return { status: 'CONFLICT', id: '', conflictIds: k3.conflictIds || [], k2: false };
  if (k3.status === 'ACTIVE_DRAFT_FOUND') {
    if (opts.allowLegacyReconcile === true) return { status: 'REUSE', id: k3.id, conflictIds: [], k2: false, legacyReconcile: true };
    return { status: 'BLOCK', reason: 'LEGACY_ROUTE_RECONCILIATION_REQUIRED', id: k3.id, conflictIds: [], k2: false };
  }
  return { status: 'BLOCK', reason: 'ROUTE_INCOMPLETE_NEW_DRAFT', id: '', conflictIds: [], k2: false };
}

// F1-7N-FA-3C-R6F2A/R6F2G5 — guard for editing an EXISTING row (resolved by explicit id OR by the K2 group authority).
// A route-incomplete GENERIC/legacy row is fail-closed (LEGACY_ROUTE_RECONCILIATION_REQUIRED) unless allowReconcile.
// R6F2G5 fix: a GENUINE K2 shipment group uses a MARKETPLACE as its logical destination, so its persisted 30-col header
// legitimately carries a BLANK recommended_destination_warehouse_id (destination_marketplace is NOT a stored column).
// The generic From+To+Method completeness rule — which the persisted header can only satisfy via a warehouse id — must
// therefore NOT reclassify a marketplace-logical K2 row as a legacy collision (the exact defect that made a committed
// K2 REUSE return LEGACY_ROUTE_RECONCILIATION_REQUIRED with zero writes). Authority for "is this a real K2 group" is the
// row's stored id EQUALLING the deterministic hash of its OWN K2 group dims (sadK2DeterministicHeaderId_) — the K2
// grouping authority, NEVER the SADH-K2- prefix alone. A SADH-K2- row whose stored dims do NOT regenerate its id
// (impostor / route drift) is refused with a DISTINCT typed K2_ROUTE_RECONCILIATION_REQUIRED (never auto-healed or
// overwritten). Generic (non-SADH-K2-) rows keep the exact original legacy rule unchanged. Returns a typed reason
// string to BLOCK, or '' to proceed.
function sadLegacyReconcileReason_(sh, found, allowReconcile) {
  if (!found || allowReconcile === true) return '';
  var o = sadRowToObject_(sh, found.row);
  var storedId = String(o.allocation_draft_id == null ? '' : o.allocation_draft_id).trim();
  if (storedId.indexOf('SADH-K2-') === 0) {
    return sadK2DeterministicHeaderId_(o) === storedId ? '' : 'K2_ROUTE_RECONCILIATION_REQUIRED';
  }
  return sadHeaderRouteIsComplete_(o) ? '' : 'LEGACY_ROUTE_RECONCILIATION_REQUIRED';
}

// R6F2G5 — reason-typed reconciliation message for the two BLOCK call sites (atomic + manual). Keeps the outcome
// observable and distinct: a genuine legacy incomplete-route collision vs a K2 shipment-group identity mismatch.
function sadReconcileMessage_(reason) {
  if (reason === 'K2_ROUTE_RECONCILIATION_REQUIRED') {
    return 'this existing K2 Draft\'s stored id is not the deterministic hash of its own shipment-group route (K2 identity mismatch); reconcile via an explicit USER migration — never auto-healed or overwritten';
  }
  return 'this existing Draft has an incomplete route; reconcile via an explicit USER migration before editing';
}

// Read one sheet row (1-based) into a header-keyed object (read-only).
function sadRowToObject_(sh, rowNum) {
  var lastCol = sh.getLastColumn();
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x).trim(); });
  var row = sh.getRange(rowNum, 1, 1, lastCol).getValues()[0];
  var o = {};
  for (var i = 0; i < hdr.length; i++) if (hdr[i]) o[hdr[i]] = row[i];
  return o;
}

// Read the non-cancelled lines for one Draft id (read-only join by allocation_draft_id).
function sadReadLinesForDraft_(lsh, draftId) {
  var data = lsh.getDataRange().getValues();
  if (data.length < 2) return [];
  var hdr = data[0].map(function (x) { return String(x).trim(); });
  var di = hdr.indexOf('allocation_draft_id'), si = hdr.indexOf('line_status');
  var out = [];
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][di]).trim() !== draftId) continue;
    if (si !== -1 && String(data[r][si] == null ? '' : data[r][si]).trim().toLowerCase() === 'cancelled') continue;
    var o = {};
    for (var c = 0; c < hdr.length; c++) if (hdr[c]) o[hdr[c]] = data[r][c];
    out.push(o);
  }
  return out;
}

// C2-D2 §9: targeted READ-ONLY Allocation-Draft readback. Reads ONLY shipping_allocation_drafts +
// shipping_allocation_draft_lines (never getOperationDb). Body: { planning_cycle, company, country, marketplace,
// source_page }. Returns { success, data:{ status, draft, lines, issues }, errors }.
function handleGetShippingAllocationDraftWorkspace_(body) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = procurementEnsureSheet_(ss, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
    var k3 = sadResolveActiveDraft_(sh, { planning_cycle: (body && body.planning_cycle), company: (body && body.company),
      country: (body && body.country), marketplace: (body && body.marketplace), source_page: (body && body.source_page) });
    if (k3.status === 'NO_ACTIVE_DRAFT') return jsonResponse_({ success: true, data: { status: 'NO_ACTIVE_DRAFT', draft: null, lines: [], issues: [] }, errors: [] });
    if (k3.status === 'BLOCKED_CONFLICT') return jsonResponse_({ success: true, data: { status: 'BLOCKED_CONFLICT', draft: null, lines: [], issues: [{ code: 'BLOCKED_CONFLICT', conflictIds: k3.conflictIds }] }, errors: [] });
    var draft = sadRowToObject_(sh, k3.row);
    var lsh = procurementEnsureSheet_(ss, 'shipping_allocation_draft_lines', SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_);
    var lines = sadReadLinesForDraft_(lsh, k3.id);
    return jsonResponse_({ success: true, data: { status: 'ACTIVE_DRAFT_FOUND', draft: draft, lines: lines, issues: [] }, errors: [] });
  } catch (e) {
    return jsonResponse_({ success: false, data: null, errors: [{ code: 'READBACK_ERROR', message: String(e && e.message ? e.message : e) }] });
  }
}

// C2-D2 §13: whole-Draft Cancel. Resolves the exact Draft (explicit id, else K3), soft-cancels the header
// (status + cancelled_* audit), PRESERVES header + lines, idempotent (repeat → benign ALREADY_CANCELLED). A
// submitted Draft is NOT cancelled (SC-1 not inferred). Under ScriptLock.
function handleCancelShippingAllocationDraft_(body) {
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = procurementEnsureSheet_(ss, 'shipping_allocation_drafts', SHIPPING_ALLOCATION_DRAFTS_HEADERS_);
    var id = String((body && body.allocation_draft_id) || '').trim();
    var found = id ? procurementFindRow_(sh, 'allocation_draft_id', id) : null;
    if (!id) {
      var k3 = sadResolveActiveDraft_(sh, { planning_cycle: (body && body.planning_cycle), company: (body && body.company),
        country: (body && body.country), marketplace: (body && body.marketplace), source_page: (body && body.source_page) });
      if (k3.status === 'BLOCKED_CONFLICT') return jsonResponse_({ success: false, error: 'BLOCKED_CONFLICT', data: { status: 'BLOCKED_CONFLICT', conflictIds: k3.conflictIds } });
      if (k3.status === 'NO_ACTIVE_DRAFT') return jsonResponse_({ success: false, error: 'NO_ACTIVE_DRAFT' });
      id = k3.id; found = procurementFindRow_(sh, 'allocation_draft_id', id);
    }
    if (!found) return jsonResponse_({ success: false, error: 'NO_ACTIVE_DRAFT' });
    function get(name) { var c = found.col(name); return c !== -1 ? String(sh.getRange(found.row, c + 1).getValue()).trim() : ''; }
    function setCol(name, val) { var c = found.col(name); if (c !== -1) sh.getRange(found.row, c + 1).setValue(val); }
    var st = get('status').toLowerCase();
    if (st === 'cancelled') return jsonResponse_({ success: true, data: { allocation_draft_id: id, status: 'cancelled', already_cancelled: true } });
    if (st === 'submitted') return jsonResponse_({ success: false, error: 'IMMUTABLE_TERMINAL_STATUS:submitted' });
    var now = procurementTimestamp_();
    var actor = String((body && body.cancelled_by) || (body && body.actor) || 'inventory-replenishment').trim();
    setCol('status', 'cancelled'); setCol('cancelled_by', actor); setCol('cancelled_at', now);
    setCol('cancel_reason', String((body && body.cancel_reason) || '').trim());
    setCol('updated_by', actor); setCol('updated_at', now);
    return jsonResponse_({ success: true, data: { allocation_draft_id: id, status: 'cancelled', already_cancelled: false } });
  } finally { try { lock.releaseLock(); } catch (e2) { /* best-effort release */ } }
}
