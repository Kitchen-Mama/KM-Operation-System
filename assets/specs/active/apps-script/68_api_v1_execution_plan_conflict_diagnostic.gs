/**
 * 68_api_v1_execution_plan_conflict_diagnostic.gs
 * F1-7N-FB-4A §C — EXECUTION PLAN IDENTITY CONFLICT DIAGNOSTIC. STRICTLY READ-ONLY.
 *
 * WHY THIS EXISTS. A live Execution Plan route answered `Database update failed` plus one sentence — "An existing
 * Draft for this scope cannot be reconciled automatically. It needs an explicit user migration." That sentence is
 * produced by the FRONTEND for TWO different backend reasons (LEGACY_ROUTE_RECONCILIATION_REQUIRED and
 * K2_ROUTE_RECONCILIATION_REQUIRED), so the operator could not tell which row was in the way, why, or whether the
 * right answer was "retry", "resolve a duplicate" or "migrate". Guessing between those is how a good row gets
 * overwritten. This diagnostic answers the question with evidence instead.
 *
 * IT RUNS THE REAL PRODUCTION AUTHORITIES — sadHeaderRouteIsComplete_, sadK2GroupKey_,
 * sadK2DeterministicHeaderId_, sadResolveActiveDraftK2OrK3_, sadK2ReconcileDecision_ and
 * sadLegacyReconcileReason_ (all owned by 16_). It re-implements none of them, because a second copy of an
 * identity rule is exactly how a "corresponding canonical id" becomes wrong.
 *
 * ZERO WRITE, STRUCTURALLY. This file contains no appendRow, no setValue/setValues, no insertSheet, no deleteRow,
 * no sheet-ensure, no LockService, no PropertiesService write, no DriveApp, no MailApp and no call into a business
 * handler. It opens the DB read-only and reads rows. A regression test asserts each of those absences against
 * comment- and string-stripped source, so the claim is proven rather than described.
 *
 * IDS ARE MASKED. A SADH-K2- id is an FNV1a hash and leaks nothing, but a legacy id can be anything and the SCOPE
 * fields around it are business data, so every id is reported masked (prefix + short tail) alongside a STABLE hash
 * the operator can correlate across runs and rows. The exact scope is reported in its own named fields, which is
 * what an operator actually needs to find the row.
 *
 * IT PROPOSES ONLY. Every disposition carries requires_user_authorization: true. Nothing here migrates, adopts,
 * cancels, deletes or overwrites anything — see §D of the FB-4A record for the migration boundary.
 */

var EPC_BUILD_VERSION_ = 'F1-7N-FB-4A';
var EPC_DRAFTS_TABLE_ = 'shipping_allocation_drafts';
var EPC_DRAFT_LINES_TABLE_ = 'shipping_allocation_draft_lines';
var EPC_PLANS_TABLE_ = 'shipping_plans';
var EPC_WAREHOUSES_TABLE_ = 'warehouses';

// The K3 scope authority's dimensions (the landed Phase-1 scope key), reported so the operator can see which
// identity family a row actually belongs to.
var EPC_K3_SCOPE_DIMS_ = ['planning_cycle', 'company', 'country', 'marketplace', 'source_page'];

// ============================================================================================================
// PURE helpers (deterministic; no Spreadsheet, no clock)
// __EPC_PURE_START__
// ============================================================================================================

function epcStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function epcLc_(v) { return epcStr_(v).toLowerCase(); }
function epcUc_(v) { return epcStr_(v).toUpperCase(); }
function epcNum_(v) { if (v === '' || v === null || v === undefined) return 0; var n = Number(v); return isFinite(n) ? n : 0; }

// Stable 32-bit FNV1a — the SAME arithmetic 16_ uses for the K2 id, so a hash printed here can be compared with
// a stored SADH-K2- suffix by eye. Local only because 16_'s sadFnv1a_ is private to the write path's file and a
// diagnostic must never depend on a symbol it does not own being loaded first.
function epcFnv1a_(s) {
  var h = 0x811c9dc5;
  s = String(s == null ? '' : s);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

// An allocation_draft_id embeds nothing business-readable for K2 (it is a hash) but a legacy id can embed
// anything, so EVERY id is masked the same way: the recognised class prefix, an ellipsis, and the last 4
// characters for eyeball correlation. The stable hash is what the operator quotes when asking for a migration.
function epcMaskId_(id) {
  var s = epcStr_(id);
  if (!s) return '';
  var prefix = s.indexOf('SADH-K2-') === 0 ? 'SADH-K2-' : (s.indexOf('SADL-K2-') === 0 ? 'SADL-K2-' : (s.indexOf('SADL-') === 0 ? 'SADL-' : (s.indexOf('SAD-') === 0 ? 'SAD-' : '')));
  var tail = s.length > 4 ? s.slice(-4) : s;
  return (prefix ? prefix : '') + '…' + tail;
}
function epcIdRef_(id) {
  var s = epcStr_(id);
  if (!s) return { masked: '', hash: '', length: 0, present: false };
  return { masked: epcMaskId_(s), hash: 'h:' + epcFnv1a_(s), length: s.length, present: true };
}

// IDENTITY FAMILY of a PERSISTED row, decided from what the row itself stores.
//   CANONICAL  — a SADH-K2- id that still equals the deterministic hash of its OWN current K2 dims.
//   K2         — a SADH-K2- id that does NOT (drifted by a later route edit, or a genuine impostor).
//   K3         — a non-K2 id whose persisted route is COMPLETE, so the landed K3 scope authority owns it.
//   LEGACY     — a non-K2 id whose persisted route is INCOMPLETE (the class the legacy guard fail-closes on).
//   UNEXPECTED — a blank or unrecognised id shape.
// The two 16_ authorities are injected so this stays pure and the suite can execute it directly.
function epcIdentityFamily_(row, deterministicIdFn, routeCompleteFn) {
  var id = epcStr_(row && row.allocation_draft_id);
  if (!id) return { family: 'UNEXPECTED', detail: 'the row carries no allocation_draft_id' };
  if (id.indexOf('SADH-K2-') === 0) {
    var own = deterministicIdFn ? epcStr_(deterministicIdFn(row)) : '';
    if (own && own === id) return { family: 'CANONICAL', detail: 'the stored id equals the deterministic hash of this row\'s own K2 shipment-group dimensions' };
    return { family: 'K2', detail: 'a K2-shaped id that no longer equals the hash of this row\'s own dimensions — the row was route-edited after its id was minted, or it is an impostor for another group' };
  }
  if (id.indexOf('SAD-') === 0 || id.indexOf('SADH-') === 0) {
    var complete = routeCompleteFn ? !!routeCompleteFn(row) : false;
    return complete
      ? { family: 'K3', detail: 'a pre-K2 scope-keyed id whose PERSISTED route is complete, so the legacy guard lets it through' }
      : { family: 'LEGACY', detail: 'a pre-K2 scope-keyed id whose PERSISTED route is incomplete; note that a marketplace-logical destination cannot be expressed by the persisted columns at all (destination_marketplace is an accepted payload field but is NOT a stored column), so such a row can never satisfy the persisted-route completeness rule' };
  }
  return { family: 'UNEXPECTED', detail: 'the stored id matches no recognised allocation-draft identity shape' };
}

// Field-by-field difference between the PERSISTED row and the INCOMING request, over the K2 grouping dimensions
// plus the K3 scope dimensions. This is the "conflicting business identity fields" answer: it names exactly which
// dimension makes the two disagree, instead of reporting that two opaque hashes differ.
function epcConflictFields_(persistedRow, wantHeader, k2Dims) {
  var dims = (k2Dims || []).slice();
  EPC_K3_SCOPE_DIMS_.forEach(function (d) { if (dims.indexOf(d) === -1) dims.push(d); });
  var o = persistedRow || {}, w = wantHeader || {};
  var out = [];
  dims.forEach(function (d) {
    var a = epcLc_(o[d]), b = epcLc_(w[d]);
    if (a !== b) out.push({ field: d, persisted: epcStr_(o[d]) || '(blank)', requested: epcStr_(w[d]) || '(blank)' });
  });
  return out;
}

// The submit path stamps the draft's note with '[SUBMITTED @<ts> → shipping_plan <ids> · exec <key>]'. That
// stamp — together with status=submitted — is the ONLY persisted evidence linking a draft to the plans it
// produced (shipping_plans carries no allocation_draft_id column). Parse it; never infer a link without it.
function epcParsePlanTag_(note) {
  var s = epcStr_(note);
  var out = { submitted_marker_present: false, shipping_plan_ids: [], execution_keys: [] };
  var re = /\[SUBMITTED @([^\]]*?)→ shipping_plan ([^·\]]*)(?:· exec ([^\]]*))?\]/g;
  var m;
  while ((m = re.exec(s)) !== null) {
    out.submitted_marker_present = true;
    epcStr_(m[2]).split(',').forEach(function (id) { var t = epcStr_(id); if (t && t !== '(reused)' && out.shipping_plan_ids.indexOf(t) === -1) out.shipping_plan_ids.push(t); });
    var k = epcStr_(m[3]); if (k && out.execution_keys.indexOf(k) === -1) out.execution_keys.push(k);
  }
  return out;
}

// SAFE, IDEMPOTENT dispositions. Every one requires explicit user authorization; none is executed here. The set
// is derived from the guard verdict, so the diagnostic can never recommend an action the writer would refuse.
function epcDispositions_(ctx) {
  ctx = ctx || {};
  var d = [];
  function add(action, effect, why) { d.push({ action: action, effect: effect, why: why, idempotent: true, requires_user_authorization: true, performed_by_this_diagnostic: false }); }
  if (ctx.terminal_status) {
    add('NO_ACTION_TERMINAL', 'nothing is written; the route stays UNSAVED and Submit Plan stays blocked for it',
      'the existing Draft is already ' + ctx.terminal_status + ' and is immutable by contract; a new business decision (a new planning cycle, or an explicit user migration) is required before this scope can be edited again');
    return d;
  }
  if (!ctx.existing_present) {
    add('SAVE_CREATES_A_NEW_HEADER', 'one INSERT under the deterministic canonical id; no existing row is touched',
      'no ACTIVE header currently owns this shipment group, so the save is a clean CREATE');
    return d;
  }
  if (ctx.guard_reason === '') {
    add('RETRY_SAVE_UPDATE_IN_PLACE', 'the existing row is UPDATED in place; its id, its lines and their FKs are unchanged',
      ctx.guard_basis === 'K2_STALE_CREATE_TIME_ID_ACCEPTED_SAME_GROUP'
        ? 'the stored id is a stale CREATE-time surrogate but the row belongs to exactly the shipment group being written, and no other active header claims that group'
        : 'the existing row passes the production reconciliation guard as-is');
    return d;
  }
  if (ctx.guard_reason === 'BLOCKED_CONFLICT') {
    add('RESOLVE_DUPLICATE_GROUP_FIRST', 'nothing is written until a human decides which header owns this shipment group',
      'more than one ACTIVE header claims this shipment group; which one is authoritative is a business decision and must not be guessed');
    add('CANCEL_THE_SUPERSEDED_HEADER', 'a soft cancel (status=cancelled + audit) of the header the user names; header and lines are PRESERVED, never deleted',
      'once the operator identifies the header that should not own the group, cancelling it leaves exactly one owner and the save proceeds normally');
    return d;
  }
  if (ctx.guard_reason === 'K2_ROUTE_RECONCILIATION_REQUIRED') {
    add('USER_MIGRATION_REQUIRED', 'nothing is written; the route stays UNSAVED and Submit Plan stays blocked',
      'the existing row carries a K2-shaped id but belongs to a DIFFERENT shipment group than the one being written, so adopting it would silently move a route between groups');
    add('SAVE_UNDER_THE_CORRECT_GROUP_HEADER', 'the caller stops sending the stale explicit allocation_draft_id and lets the K2 authority resolve the correct header',
      'the id being sent does not name this route\'s group; the deterministic id for the requested group is reported above as proposed_allocation_draft_id');
    return d;
  }
  if (ctx.guard_reason === 'LEGACY_ROUTE_RECONCILIATION_REQUIRED') {
    add('USER_MIGRATION_REQUIRED', 'nothing is written; the route stays UNSAVED and Submit Plan stays blocked',
      'the existing row is a pre-K2 scope-keyed header whose PERSISTED route is incomplete; adopting it would make a non-canonical id the identity of a canonical K2 write, which is a migration decision, not a runtime repair');
    add('MIGRATE_LEGACY_HEADER_TO_CANONICAL_IDENTITY', 'a separate, user-authorized migration task; see the FB-4A §D migration plan for the exact before/after identity, FK and quantity effects',
      'the migration is idempotent and re-runnable, but it rewrites an identity and the line FKs that point at it, so it is never performed inside a save');
    return d;
  }
  add('REPORT_TO_ENGINEERING', 'nothing is written', 'the guard returned a reason this diagnostic does not have a disposition for: ' + epcStr_(ctx.guard_reason));
  return d;
}

// __EPC_PURE_END__

// ============================================================================================================
// IMPURE layer — read-only sheet access
// ============================================================================================================

function epcEnvelope_(ok, data, errors) {
  return {
    success: !!ok,
    data: ok ? (data === undefined ? null : data) : null,
    errors: ok ? [] : (errors || []),
    meta: { apiVersion: '1', action: 'system.executionPlanConflictDiagnostic', build: EPC_BUILD_VERSION_,
      read_only: true, db_writes: 0, drive_writes: 0, property_writes: 0, status_transitions: 0, emails: 0,
      rows_migrated: 0, rows_deleted: 0, locks_taken: 0, demo_mutations: 0 }
  };
}

// Read a whole tab into header-keyed objects. Read-only; a missing tab is reported as absent, never created.
function epcReadTable_(ss, name) {
  var sh = null;
  try { sh = ss.getSheetByName(name); } catch (e) { sh = null; }
  if (!sh) return { present: false, rows: [], headers: [] };
  var data = sh.getDataRange().getValues();
  if (!data || data.length < 1) return { present: true, rows: [], headers: [] };
  var headers = data[0].map(function (h) { return epcStr_(h); });
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var o = {};
    for (var c = 0; c < headers.length; c++) if (headers[c]) o[headers[c]] = data[r][c];
    rows.push(o);
  }
  return { present: true, rows: rows, headers: headers };
}

// Resolve a source/destination warehouse the operator identified by ID, CODE or NAME. Read-only convenience so
// the live route can be described the way the OPERATOR sees it ("CN侑鑫") without hand-copying an internal id.
// An ambiguous token is reported as ambiguous — never silently resolved to the first match.
function epcResolveWarehouse_(warehouseRows, token) {
  var t = epcStr_(token);
  if (!t) return { supplied: false, resolved: false, warehouse_id: '', matches: [] };
  var lc = t.toLowerCase();
  var matches = [];
  (warehouseRows || []).forEach(function (w) {
    var id = epcStr_(w.warehouse_id), code = epcStr_(w.warehouse_code), name = epcStr_(w.warehouse_name);
    if (id.toLowerCase() === lc || code.toLowerCase() === lc || name.toLowerCase() === lc) {
      matches.push({ warehouse_id: id, warehouse_code: code, warehouse_name: name });
    }
  });
  return {
    supplied: true,
    resolved: matches.length === 1,
    ambiguous: matches.length > 1,
    warehouse_id: matches.length === 1 ? matches[0].warehouse_id : '',
    matches: matches.slice(0, 5),
    note: matches.length === 0 ? 'no warehouses row matched this token by warehouse_id, warehouse_code or warehouse_name'
      : (matches.length > 1 ? 'AMBIGUOUS — more than one warehouses row matched; supply the exact warehouse_id' : '')
  };
}

/**
 * action `system.executionPlanConflictDiagnostic` — READ-ONLY.
 *
 * Body (the exact route/business scope, the shape the Execution Plan save itself sends):
 *   {
 *     header: { planning_cycle, company, country, marketplace, source_page?,
 *               recommended_source_warehouse_id | source_warehouse_token,
 *               recommended_destination_warehouse_id, destination_marketplace?,
 *               recommended_shipping_method, recommended_last_mile_delivery?, recommendation_group_no?,
 *               recommended_source_warehouse_code_snapshot?, recommended_destination_warehouse_code_snapshot? },
 *     allocation_draft_id?,          // the explicit id the page would send (usually the hydrated one)
 *     sku?, site_sku?, planned_qty?, route_no?, expected_arrival?
 *   }
 */
function handleExecutionPlanConflictDiagnostic_(body) {
  body = body || {};
  var b0 = (body.payload && typeof body.payload === 'object') ? body.payload : body;
  var want = {};
  var inHeader = (b0.header && typeof b0.header === 'object') ? b0.header : b0;
  ['planning_cycle', 'company', 'country', 'marketplace', 'source_page',
    'recommended_source_warehouse_id', 'recommended_destination_warehouse_id',
    'recommended_source_warehouse_code_snapshot', 'recommended_destination_warehouse_code_snapshot',
    'recommended_shipping_method', 'recommended_last_mile_delivery', 'recommendation_group_no',
    'destination_marketplace'].forEach(function (f) { want[f] = epcStr_(inHeader[f]); });
  if (!want.source_page) want.source_page = 'inventory_replenishment';

  var explicitId = epcStr_(b0.allocation_draft_id || b0.allocationDraftId);
  var sku = epcStr_(b0.sku), siteSku = epcStr_(b0.site_sku || b0.siteSku);
  var plannedQty = (b0.planned_qty === undefined && b0.plannedQty === undefined) ? null : epcNum_(b0.planned_qty !== undefined ? b0.planned_qty : b0.plannedQty);
  var routeNo = epcStr_(b0.route_no || b0.routeNo);
  var expectedArrival = epcStr_(b0.expected_arrival || b0.expectedArrival);

  var ss;
  try { ss = SpreadsheetApp.openById(prodExpectedDbId_()); }
  catch (e) { return epcEnvelope_(false, null, [{ code: 'DB_NOT_REACHABLE', message: 'the configured production database could not be opened read-only' }]); }

  var drafts = epcReadTable_(ss, EPC_DRAFTS_TABLE_);
  var lines = epcReadTable_(ss, EPC_DRAFT_LINES_TABLE_);
  var plans = epcReadTable_(ss, EPC_PLANS_TABLE_);
  var warehouses = epcReadTable_(ss, EPC_WAREHOUSES_TABLE_);
  if (!drafts.present) return epcEnvelope_(false, null, [{ code: 'DRAFTS_TABLE_MISSING', message: EPC_DRAFTS_TABLE_ + ' is not present in the production database' }]);

  // Operator convenience: accept a warehouse token (id/code/name) for either endpoint. Never guesses.
  var srcResolve = epcResolveWarehouse_(warehouses.rows, b0.source_warehouse_token || b0.sourceWarehouseToken);
  var dstResolve = epcResolveWarehouse_(warehouses.rows, b0.destination_warehouse_token || b0.destinationWarehouseToken);
  if (!want.recommended_source_warehouse_id && srcResolve.resolved) want.recommended_source_warehouse_id = srcResolve.warehouse_id;
  if (!want.recommended_destination_warehouse_id && dstResolve.resolved) want.recommended_destination_warehouse_id = dstResolve.warehouse_id;

  var K2_DIMS = (typeof SAD_K2_GROUP_DIMENSIONS_ !== 'undefined') ? SAD_K2_GROUP_DIMENSIONS_ : [];
  var routeCompleteFn = (typeof sadHeaderRouteIsComplete_ === 'function') ? sadHeaderRouteIsComplete_ : null;
  var groupKeyFn = (typeof sadK2GroupKey_ === 'function') ? sadK2GroupKey_ : null;
  var detIdFn = (typeof sadK2DeterministicHeaderId_ === 'function') ? sadK2DeterministicHeaderId_ : null;
  if (!routeCompleteFn || !groupKeyFn || !detIdFn) {
    return epcEnvelope_(false, null, [{ code: 'DEPLOYMENT_CONTRACT_MISMATCH', message: '16_shipping_allocation_handlers.gs is not present in the DEPLOYED code, so the production identity authorities cannot be run. Sync the Apps Script files and publish a new deployment version.' }]);
  }

  var ACTIVE = { draft: 1, site_confirmed: 1, partially_submitted: 1 };
  var activeRows = drafts.rows.filter(function (r) { return ACTIVE[epcLc_(r.status)] === 1; });

  var wantGroupKey = groupKeyFn(want);
  var proposedId = detIdFn(want);
  var requestRouteComplete = !!routeCompleteFn(want);

  // ---- who currently claims this shipment group / this K3 scope -------------------------------------------
  var sameGroup = activeRows.filter(function (r) { return groupKeyFn(r) === wantGroupKey; });
  var sameK3Scope = activeRows.filter(function (r) {
    return EPC_K3_SCOPE_DIMS_.every(function (d) { return epcLc_(r[d]) === epcLc_(want[d]); });
  });

  // ---- resolve the EXISTING row the way the writer would --------------------------------------------------
  var existing = null, existingBasis = '';
  if (explicitId) {
    existing = drafts.rows.filter(function (r) { return epcStr_(r.allocation_draft_id) === explicitId; })[0] || null;
    existingBasis = existing ? 'the explicit allocation_draft_id supplied by the caller (this is what the page sends)' : 'the explicit allocation_draft_id supplied by the caller was NOT FOUND in ' + EPC_DRAFTS_TABLE_;
  }
  if (!existing && sameGroup.length === 1) { existing = sameGroup[0]; existingBasis = 'no explicit id was supplied; exactly one ACTIVE header claims this shipment group'; }
  if (!existing && sameGroup.length > 1) { existingBasis = 'no explicit id was supplied and MORE THAN ONE ACTIVE header claims this shipment group'; }
  if (!existing && !sameGroup.length) { existingBasis = existingBasis || 'no ACTIVE header claims this shipment group — the save would CREATE'; }

  var fam = existing ? epcIdentityFamily_(existing, detIdFn, routeCompleteFn) : { family: 'NOT_FOUND', detail: 'no persisted row was resolved for this scope' };
  var existingStatus = existing ? epcLc_(existing.status) : '';
  var terminal = (existingStatus === 'submitted' || existingStatus === 'cancelled') ? existingStatus : '';

  // ---- the EXACT guard verdict, from the production decision function -------------------------------------
  var guardReason = '', guardBasis = '', guardConflictIds = [];
  if (existing) {
    var storedId = epcStr_(existing.allocation_draft_id);
    if (storedId.indexOf('SADH-K2-') === 0) {
      if (typeof sadK2ReconcileDecision_ === 'function') {
        var dec = sadK2ReconcileDecision_(existing, want, activeRows);
        guardReason = dec.reason; guardBasis = dec.basis; guardConflictIds = dec.conflictIds || [];
      } else {
        guardReason = (detIdFn(existing) === storedId) ? '' : 'K2_ROUTE_RECONCILIATION_REQUIRED';
        guardBasis = 'PRE_FB4A_SELF_HASH_RULE (sadK2ReconcileDecision_ is not present in the deployed code)';
      }
    } else {
      guardReason = routeCompleteFn(existing) ? '' : 'LEGACY_ROUTE_RECONCILIATION_REQUIRED';
      guardBasis = routeCompleteFn(existing) ? 'LEGACY_ROW_PERSISTED_ROUTE_IS_COMPLETE' : 'LEGACY_ROW_PERSISTED_ROUTE_IS_INCOMPLETE';
    }
  }

  // The pre-write header gate the writer runs FIRST — reported separately, because a request-side failure and an
  // existing-row failure are different problems with different fixes.
  var hasRouteIntent = !!(want.recommended_source_warehouse_id || want.recommended_shipping_method || want.recommended_destination_warehouse_id);
  var preWriteGate = (hasRouteIntent && !requestRouteComplete) ? 'PLAN_HEADER_INCOMPLETE' : '';

  var blocking = preWriteGate || (terminal ? ('IMMUTABLE_TERMINAL_STATUS:' + terminal) : guardReason) || '';

  // ---- existing lines --------------------------------------------------------------------------------------
  var existingLines = [];
  if (existing && lines.present) {
    var eid = epcStr_(existing.allocation_draft_id);
    lines.rows.forEach(function (l) {
      if (epcStr_(l.allocation_draft_id) !== eid) return;
      existingLines.push({
        allocation_draft_line_id_ref: epcIdRef_(l.allocation_draft_line_id),
        sku: epcStr_(l.sku), site_sku: epcStr_(l.site_sku), window_code: epcStr_(l.window_code),
        route_no: epcStr_(l.route_no), planned_qty: epcNum_(l.planned_qty), recommended_qty: epcStr_(l.recommended_qty),
        line_source_warehouse_id_ref: epcIdRef_(l.source_warehouse_id),
        line_status: epcLc_(l.line_status) || '(blank)',
        matches_requested_sku: !!sku && epcUc_(l.sku) === epcUc_(sku)
      });
    });
  }

  // ---- has the existing row already produced a Shipping Plan? ---------------------------------------------
  var planTag = epcParsePlanTag_(existing ? existing.note : '');
  var planEvidence = {
    header_status: existingStatus || null,
    submitted_at: existing ? epcStr_(existing.submitted_at) : '',
    submitted_marker_present: planTag.submitted_marker_present,
    shipping_plan_ids_masked: planTag.shipping_plan_ids.map(epcMaskId_),
    shipping_plan_ids_found_in_db: [],
    shipping_plan_ids_not_found: [],
    verdict: 'NO_EVIDENCE_OF_A_SHIPPING_PLAN',
    basis: 'shipping_plans carries no allocation_draft_id column, so the ONLY persisted link is the submit stamp the transition writes into the draft note. Absence of that stamp is reported as absence of evidence — never as proof that no plan exists.'
  };
  if (planTag.shipping_plan_ids.length && plans.present) {
    var planIdSet = {};
    plans.rows.forEach(function (p) { var pid = epcStr_(p.shipping_plan_id); if (pid) planIdSet[pid] = epcLc_(p.status); });
    planTag.shipping_plan_ids.forEach(function (pid) {
      if (planIdSet[pid] !== undefined) planEvidence.shipping_plan_ids_found_in_db.push({ masked: epcMaskId_(pid), status: planIdSet[pid] });
      else planEvidence.shipping_plan_ids_not_found.push(epcMaskId_(pid));
    });
  }
  if (planTag.submitted_marker_present) {
    planEvidence.verdict = planEvidence.shipping_plan_ids_found_in_db.length ? 'SHIPPING_PLAN_PRODUCED_AND_FOUND' : 'SUBMIT_STAMP_PRESENT_BUT_PLAN_ROW_NOT_FOUND';
  } else if (existingStatus === 'submitted') {
    planEvidence.verdict = 'SUBMITTED_WITHOUT_A_PLAN_STAMP';
  }

  var dispositions = epcDispositions_({
    terminal_status: terminal,
    existing_present: !!existing,
    guard_reason: blocking === preWriteGate && preWriteGate ? 'PLAN_HEADER_INCOMPLETE' : guardReason,
    guard_basis: guardBasis
  });

  return epcEnvelope_(true, {
    build_version: EPC_BUILD_VERSION_,
    read_only: true,
    zero_write_proof: {
      db_writes: 0, drive_writes: 0, property_writes: 0, locks_taken: 0, status_transitions: 0,
      rows_migrated: 0, rows_deleted: 0, emails: 0, demo_mutations: 0,
      statement: 'THIS DIAGNOSTIC PERFORMED NO WRITE, NO MIGRATION AND NO OVERWRITE. It opened the database read-only, read ' + EPC_DRAFTS_TABLE_ + ', ' + EPC_DRAFT_LINES_TABLE_ + ', ' + EPC_PLANS_TABLE_ + ' and ' + EPC_WAREHOUSES_TABLE_ + ', and returned a report.'
    },

    // ---- the business scope, echoed exactly as evaluated ----
    requested_scope: {
      planning_cycle: want.planning_cycle, company: want.company, country: want.country, marketplace: want.marketplace,
      source_page: want.source_page, sku: sku, site_sku: siteSku, planned_qty: plannedQty, route_no: routeNo,
      expected_arrival: expectedArrival,
      source_warehouse_id: want.recommended_source_warehouse_id,
      source_warehouse_code_snapshot: want.recommended_source_warehouse_code_snapshot,
      source_warehouse_resolution: srcResolve,
      destination_warehouse_id: want.recommended_destination_warehouse_id,
      destination_warehouse_code_snapshot: want.recommended_destination_warehouse_code_snapshot,
      destination_warehouse_resolution: dstResolve,
      destination_marketplace: want.destination_marketplace,
      destination_is_logical_marketplace: want.destination_marketplace !== '',
      shipping_method: want.recommended_shipping_method,
      last_mile_delivery: want.recommended_last_mile_delivery,
      recommendation_group_no: want.recommendation_group_no,
      route_complete_by_production_predicate: requestRouteComplete
    },

    // ---- identity ----
    identity: {
      proposed_allocation_draft_id_ref: epcIdRef_(proposedId),
      proposed_allocation_draft_id_prefix: epcStr_(proposedId).slice(0, 8),
      existing_allocation_draft_id_ref: existing ? epcIdRef_(existing.allocation_draft_id) : epcIdRef_(''),
      existing_resolution_basis: existingBasis,
      explicit_id_supplied_by_caller_ref: epcIdRef_(explicitId),
      explicit_id_found: !!(explicitId && existing && epcStr_(existing.allocation_draft_id) === explicitId),
      identity_family: fam.family,
      identity_family_detail: fam.detail,
      requested_k2_group_key_hash: 'h:' + epcFnv1a_(wantGroupKey),
      existing_k2_group_key_hash: existing ? ('h:' + epcFnv1a_(groupKeyFn(existing))) : '',
      existing_row_regenerates_its_own_id: existing ? (detIdFn(existing) === epcStr_(existing.allocation_draft_id)) : null,
      k2_group_dimensions: K2_DIMS
    },

    // ---- existing header ----
    existing_header: existing ? {
      status: existingStatus, draft_version: epcStr_(existing.draft_version),
      generation_type: epcStr_(existing.generation_type), formula_version: epcStr_(existing.formula_version),
      calculation_run_id_ref: epcIdRef_(existing.calculation_run_id),
      calculated_at: epcStr_(existing.calculated_at), source_data_as_of: epcStr_(existing.source_data_as_of),
      planning_cycle: epcStr_(existing.planning_cycle), source_page: epcStr_(existing.source_page),
      company: epcStr_(existing.company), country: epcStr_(existing.country), marketplace: epcStr_(existing.marketplace),
      source_warehouse_id_ref: epcIdRef_(existing.recommended_source_warehouse_id),
      source_warehouse_code_snapshot: epcStr_(existing.recommended_source_warehouse_code_snapshot),
      destination_warehouse_id_ref: epcIdRef_(existing.recommended_destination_warehouse_id),
      destination_warehouse_code_snapshot: epcStr_(existing.recommended_destination_warehouse_code_snapshot),
      shipping_method: epcStr_(existing.recommended_shipping_method),
      last_mile_delivery: epcStr_(existing.recommended_last_mile_delivery),
      recommendation_group_no: epcStr_(existing.recommendation_group_no),
      persisted_route_complete_by_production_predicate: !!routeCompleteFn(existing),
      created_at: epcStr_(existing.created_at), updated_at: epcStr_(existing.updated_at), updated_by: epcStr_(existing.updated_by)
    } : null,
    existing_lines: existingLines,
    existing_line_count: existingLines.length,
    existing_lines_matching_requested_sku: existingLines.filter(function (l) { return l.matches_requested_sku; }).length,

    // ---- conflict ----
    conflict: {
      conflicting_business_identity_fields: existing ? epcConflictFields_(existing, want, K2_DIMS) : [],
      active_headers_claiming_this_shipment_group: sameGroup.length,
      active_headers_claiming_this_shipment_group_refs: sameGroup.map(function (r) { return epcIdRef_(r.allocation_draft_id); }),
      active_headers_in_this_k3_scope: sameK3Scope.length,
      active_headers_in_this_k3_scope_refs: sameK3Scope.map(function (r) { return epcIdRef_(r.allocation_draft_id); }),
      duplicate_count: Math.max(sameGroup.length - 1, 0),
      guard_conflict_id_refs: guardConflictIds.map(epcIdRef_)
    },

    // ---- verdict ----
    reconciliation: {
      classification: guardReason || (existing ? 'PASSES_RECONCILIATION_GUARD' : 'NO_EXISTING_ROW'),
      basis: guardBasis,
      pre_write_header_gate: preWriteGate || 'PASS',
      exact_blocking_reason: blocking || 'NONE — this scope would save',
      operator_message: blocking
        ? ((typeof sadReconcileMessage_ === 'function' && (guardReason === 'K2_ROUTE_RECONCILIATION_REQUIRED' || guardReason === 'LEGACY_ROUTE_RECONCILIATION_REQUIRED' || guardReason === 'BLOCKED_CONFLICT'))
          ? sadReconcileMessage_(guardReason) : blocking)
        : 'no blocker: the save would proceed and write exactly one header row (' + (existing ? 'UPDATE in place' : 'INSERT') + ')',
      expected_classification: blocking ? 'NO WRITE' : (existing ? 'UPDATE' : 'INSERT'),
      route_stays_unsaved: !!blocking,
      submit_plan_blocked_for_this_route: !!blocking
    },
    shipping_plan_evidence: planEvidence,
    safe_dispositions: dispositions,
    next_action: blocking
      ? 'Read reconciliation.exact_blocking_reason and pick ONE of safe_dispositions. THIS DIAGNOSTIC PERFORMED NO MIGRATION, NO OVERWRITE AND NO WRITE.'
      : 'No blocker was found for this scope. If the page still reports UNSAVED, re-run with the EXACT allocation_draft_id the page sends — a stale hydrated id is itself a reportable cause.'
  }, []);
}

// ============================================================================================================
// EDITOR-RUNNABLE READ-ONLY WRAPPER. Fill the constants with the route exactly as the Execution Plan shows it,
// then press Run. It reads and reports; it can never write. Warehouse endpoints may be given by warehouse_id,
// warehouse_code or warehouse_name — an ambiguous name is reported as ambiguous, never resolved by guessing.
// ============================================================================================================

var TEMP_EPC_PLANNING_CYCLE_ = 'PASTE_YYYY-MM_HERE';
var TEMP_EPC_COMPANY_ = '';                      // blank = whatever the Execution Plan context shows
var TEMP_EPC_COUNTRY_ = 'US';
var TEMP_EPC_MARKETPLACE_ = 'Amazon';
var TEMP_EPC_SKU_ = 'CO1100-R';
var TEMP_EPC_PLANNED_QTY_ = 400;
var TEMP_EPC_SOURCE_WAREHOUSE_TOKEN_ = 'CN侑鑫';  // warehouse_id, warehouse_code or warehouse_name
var TEMP_EPC_DESTINATION_WAREHOUSE_TOKEN_ = '';  // blank for an Amazon LOGICAL destination
var TEMP_EPC_DESTINATION_MARKETPLACE_ = 'Amazon';// set for a logical destination; blank for a warehouse destination
var TEMP_EPC_SHIPPING_METHOD_ = '';              // paste the exact method shown on the row
var TEMP_EPC_EXPECTED_ARRIVAL_ = '2026-10-15';
var TEMP_EPC_EXPLICIT_DRAFT_ID_ = '';            // paste the id the page sends, when known

function TEMP_EXECUTION_PLAN_CONFLICT_DIAGNOSE() {
  var cycle = epcStr_(TEMP_EPC_PLANNING_CYCLE_);
  if (!cycle || cycle.indexOf('PASTE_') === 0) {
    Logger.log('[EPC] BLOCKED — set TEMP_EPC_PLANNING_CYCLE_ (YYYY-MM) in 68_api_v1_execution_plan_conflict_diagnostic.gs and Run again.');
    Logger.log('[EPC] Edit the SOURCE constant in this file. Do NOT add a Script Property — this wrapper reads the source value only.');
    Logger.log('[EPC] Nothing was read from the drafts table and nothing was written.');
    return;
  }
  var r = handleExecutionPlanConflictDiagnostic_({
    payload: {
      header: {
        planning_cycle: cycle, company: TEMP_EPC_COMPANY_, country: TEMP_EPC_COUNTRY_, marketplace: TEMP_EPC_MARKETPLACE_,
        source_page: 'inventory_replenishment',
        recommended_shipping_method: TEMP_EPC_SHIPPING_METHOD_,
        destination_marketplace: TEMP_EPC_DESTINATION_MARKETPLACE_
      },
      source_warehouse_token: TEMP_EPC_SOURCE_WAREHOUSE_TOKEN_,
      destination_warehouse_token: TEMP_EPC_DESTINATION_WAREHOUSE_TOKEN_,
      sku: TEMP_EPC_SKU_, planned_qty: TEMP_EPC_PLANNED_QTY_, expected_arrival: TEMP_EPC_EXPECTED_ARRIVAL_,
      allocation_draft_id: TEMP_EPC_EXPLICIT_DRAFT_ID_
    }
  });
  if (!r.success) { Logger.log('[EPC] FAILED ' + JSON.stringify(r.errors) + ' | 0 writes.'); return; }
  var d = r.data;
  Logger.log('[EPC] BLOCKING REASON: ' + d.reconciliation.exact_blocking_reason);
  Logger.log('[EPC] classification=' + d.reconciliation.classification + ' basis=' + d.reconciliation.basis
    + ' pre_write_gate=' + d.reconciliation.pre_write_header_gate + ' expected=' + d.reconciliation.expected_classification);
  Logger.log('[EPC] identity family=' + d.identity.identity_family + ' — ' + d.identity.identity_family_detail);
  Logger.log('[EPC] proposed=' + JSON.stringify(d.identity.proposed_allocation_draft_id_ref)
    + ' existing=' + JSON.stringify(d.identity.existing_allocation_draft_id_ref)
    + ' regenerates_own_id=' + d.identity.existing_row_regenerates_its_own_id);
  Logger.log('[EPC] scope ' + JSON.stringify(d.requested_scope));
  Logger.log('[EPC] existing_header ' + JSON.stringify(d.existing_header));
  Logger.log('[EPC] conflict ' + JSON.stringify(d.conflict));
  Logger.log('[EPC] lines=' + d.existing_line_count + ' matching_sku=' + d.existing_lines_matching_requested_sku);
  (d.existing_lines || []).slice(0, 25).forEach(function (l) { Logger.log('[EPC][line] ' + JSON.stringify(l)); });
  Logger.log('[EPC] shipping_plan_evidence ' + JSON.stringify(d.shipping_plan_evidence));
  (d.safe_dispositions || []).forEach(function (x) { Logger.log('[EPC][disposition] ' + x.action + ' — ' + x.effect + ' — ' + x.why); });
  Logger.log('[EPC] ' + d.zero_write_proof.statement);
  Logger.log('[EPC] next_action: ' + d.next_action);
}
