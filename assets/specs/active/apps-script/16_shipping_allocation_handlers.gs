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

  var id = String((body && body.allocation_draft_id) || '').trim();
  var found = id ? procurementFindRow_(sh, 'allocation_draft_id', id) : null;

  // C2-D2 §3: centralized K3 Active-Draft resolution when no explicit id (key = planning_cycle + company +
  // country + marketplace + source_page; NEVER draft_version, NEVER recommendation_group_no).
  //   0 Active → CREATE · 1 Active → REUSE/UPDATE · >1 Active → BLOCKED_CONFLICT (zero mutation, conflict IDs).
  if (!id) {
    var k3 = sadResolveActiveDraft_(sh, { planning_cycle: (body && body.planning_cycle), company: (body && body.company),
      country: (body && body.country), marketplace: (body && body.marketplace), source_page: (body && body.source_page) });
    if (k3.status === 'BLOCKED_CONFLICT') {
      return jsonResponse_({ success: false, error: 'BLOCKED_CONFLICT — more than one Active Draft for this scope; resolve manually (zero rows written)', data: { status: 'BLOCKED_CONFLICT', conflictIds: k3.conflictIds } });
    }
    if (k3.status === 'ACTIVE_DRAFT_FOUND') { id = k3.id; found = procurementFindRow_(sh, 'allocation_draft_id', id); }
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
      if (cId0 !== -1) { var curId0 = String(sh.getRange(found.row, cId0 + 1).getValue()).trim(); if (!curId0) sh.getRange(found.row, cId0 + 1).setValue(sadDeterministicLineId_(draftId, l)); }
      function setU(name) { if (l[name] != null) { var c = found.col(name); if (c !== -1) sh.getRange(found.row, c + 1).setValue(String(l[name])); } }
      // Execution-Plan (user) fields — always update when provided.
      EXEC_FIELDS.forEach(setU);
      // Recommendation snapshot — update ONLY when explicitly provided (preserve otherwise).
      SAD_RECOMMENDATION_FIELDS_.forEach(function (f) { if (l[f] != null && l[f] !== '') setU(f); });
      var uc = found.col('updated_at'); if (uc !== -1) sh.getRange(found.row, uc + 1).setValue(now);
      updated++;
    } else {
      // R6F: DETERMINISTIC id (frozen formula) so regeneration/edit of the same logical line reuses the same id
      // (no random-UUID drift, no duplicate on retry). Explicit ids from the frontend are honored as-is.
      if (!lineId) lineId = sadDeterministicLineId_(draftId, l);
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

  // resolve the header id: explicit id, else the landed K3 active-draft (LIVE K2 resolution is HALTed). Fail closed
  // on a >1 active-draft conflict with ZERO mutation.
  var id = String(header.allocation_draft_id || '').trim();
  var found = id ? procurementFindRow_(hSh, 'allocation_draft_id', id) : null;
  if (!id) {
    var k3 = sadResolveActiveDraft_(hSh, { planning_cycle: header.planning_cycle, company: header.company,
      country: header.country, marketplace: header.marketplace, source_page: header.source_page });
    if (k3.status === 'BLOCKED_CONFLICT') return jsonResponse_({ success: false, error: 'BLOCKED_CONFLICT — more than one Active Draft for this scope (zero rows written)', stage: 'header', zero_write: true, data: { conflictIds: k3.conflictIds } });
    if (k3.status === 'ACTIVE_DRAFT_FOUND') { id = k3.id; found = procurementFindRow_(hSh, 'allocation_draft_id', id); }
  }
  if (found) {
    var cS = found.col('status'); var st = cS !== -1 ? String(hSh.getRange(found.row, cS + 1).getValue()).trim().toLowerCase() : '';
    if (st === 'submitted' || st === 'cancelled') return jsonResponse_({ success: false, error: 'IMMUTABLE_TERMINAL_STATUS:' + st, stage: 'terminal', zero_write: true });
  }

  var now = procurementTimestamp_();
  var actor = String(header.created_by || 'inventory-replenishment').trim();
  var status = String(header.status || 'draft').trim(); if (!SAD_STATUSES_[status]) status = 'draft';
  var newHeaderCreated = false;

  // ---- WRITE PHASE (header first, then all lines) — one lock is already held by the public handler ------------
  if (found) {
    (function () {
      function setCol(name, val) { var c = found.col(name); if (c !== -1) hSh.getRange(found.row, c + 1).setValue(val); }
      setCol('status', status);
      ['recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_source_warehouse_code_snapshot',
        'recommended_destination_warehouse_code_snapshot', 'recommendation_group_no', 'recommended_shipping_method',
        'recommended_last_mile_delivery'].forEach(function (f) { if (header[f] != null) setCol(f, String(header[f])); });
      if (header.note != null) setCol('note', String(header.note));
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
        if (cId0 !== -1) { var curId0 = String(lSh.getRange(lf.row, cId0 + 1).getValue()).trim(); if (!curId0) lSh.getRange(lf.row, cId0 + 1).setValue(sadDeterministicLineId_(id, l)); }
        (function (found2, line) {
          function setU(name) { if (line[name] != null) { var c = found2.col(name); if (c !== -1) lSh.getRange(found2.row, c + 1).setValue(String(line[name])); } }
          EXEC_FIELDS.forEach(setU);
          SAD_RECOMMENDATION_FIELDS_.forEach(function (f) { if (line[f] != null && line[f] !== '') setU(f); });
          var uc = found2.col('updated_at'); if (uc !== -1) lSh.getRange(found2.row, uc + 1).setValue(now);
        })(lf, l);
        updated++;
      } else {
        if (!lineId) lineId = sadDeterministicLineId_(id, l);
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
  return jsonResponse_({ success: true, data: { allocation_draft_id: id, created_header: newHeaderCreated, line_count: created + updated, created: created, updated: updated, skipped: skipped } });
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
