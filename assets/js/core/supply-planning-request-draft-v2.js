// Kitchen Mama Operation System — Request Order Allocation Draft V2 (FLATTEN) — PURE core (F1-7N-FA-3C-DRAFT-MODEL-R2).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC realization of the FROZEN flat MONTHLY_ORDER decision-workspace contract
// (docs/planning/REQUEST_ORDER_ALLOCATION_DRAFT_V2_FLATTEN_DESIGN_FREEZE.md). ONE flat request_order_allocation_drafts
// row per natural scope, fixed t1_/t2_/t3_ decision + provenance columns; NO child lines; NO T4; NO retired
// calculation snapshots. This module owns NO Sheets/LockService/Date.now/Math.random/locale — the caller injects
// `now`/`actor`; input is never mutated. It is intentionally MONTHLY_ORDER-specific and independent of the shared
// line-oriented persistence engine (KMPB/KMPPB/KMPR/KMPC), which still serves WEEKLY_SHIPPING (variable per-source
// lines, YYYY-Www cycle). It changes NO recommendation/gap/§41/carton math — carton_qty uses the existing
// ceil(order/upc) rule only as an initial default; recommended_qty is a verbatim Suggested Qty snapshot.
// NOT YET WIRED into the .gs runtime or the bundle (R2 = tests-only / compatibility boundary; live-path wiring is R2b).

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.requestDraftV2 = api; }
})(this, function () {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function num(v) { var n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function nn(v) { var n = num(v); return (n !== null && n > 0) ? n : 0; }   // non-negative-or-zero numeric

  var TIERS = ['T1', 'T2', 'T3'];
  var TIER_STATUS = { draft: 1, submitted: 1, cancelled: 1 };
  var HEADER_STATUS = { draft: 1, partially_submitted: 1, submitted: 1, cancelled: 1 };
  // identity scope (planning_cycle is a SEPARATE id segment; not part of scopeKey)
  var SCOPE_FIELDS = ['company', 'country', 'draft_purpose', 'marketplace', 'sku'];   // alphabetical → deterministic

  // FROZEN 53-column canonical order (R1 §1). Terminology: tN_status (NOT tN_line_status).
  function tierCols(t) {
    var p = t.toLowerCase() + '_';
    return [p + 'month', p + 'recommended_qty', p + 'order_qty', p + 'carton_qty', p + 'status',
      p + 'submitted_by', p + 'submitted_at', p + 'user_edited', p + 'user_edited_by', p + 'note'];
  }
  var V2_HEADERS = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku',
    'status', 'generation_type', 'draft_purpose', 'draft_version',
    'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of', 'units_per_carton']
    .concat(tierCols('T1')).concat(tierCols('T2')).concat(tierCols('T3'))
    .concat(['created_by', 'created_at', 'updated_by', 'updated_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note']);

  // ---- planning_cycle normalization: exactly YYYY-MM (no locale parsing; datetime/slash rejected) --------------
  function normalizePlanningCycleMonthly(input) {
    var s = str(input);
    var m = /^(\d{4})-(\d{1,2})$/.exec(s);
    if (!m) throw new Error('INVALID_PLANNING_CYCLE: expected YYYY-MM, got "' + s + '"');   // rejects datetime, YYYY/MM, blank
    var mo = Number(m[2]);
    if (mo < 1 || mo > 12) throw new Error('INVALID_PLANNING_CYCLE: month out of range in "' + s + '"');
    return m[1] + '-' + (mo < 10 ? '0' + mo : String(mo));   // zero-pad single-digit month (unambiguous)
  }

  // ---- deterministic identity: RD::MONTHLY_ORDER::<YYYY-MM>::<sorted scopeKey> (no Date/UUID) ------------------
  function scopeKey(scope) {
    aType(isObj(scope), 'scopeKey: scope object required');
    return SCOPE_FIELDS.map(function (k) { return k + '=' + str(scope[k]); }).join('|');
  }
  function draftId(scope, planningCycle) {
    return 'RD::MONTHLY_ORDER::' + normalizePlanningCycleMonthly(planningCycle) + '::' + scopeKey(scope);
  }
  function naturalKey(scope, planningCycle) {   // separate from the opaque id string
    return { recommendationType: 'MONTHLY_ORDER', planning_cycle: normalizePlanningCycleMonthly(planningCycle),
      company: str(scope.company), country: str(scope.country), marketplace: str(scope.marketplace),
      sku: str(scope.sku), draft_purpose: str(scope.draft_purpose) };
  }

  // ---- actionable gate: AI persists only if SUM(tN_recommended_qty) > 0; manual may create all-zero -----------
  function sumRecommended(row) { return nn(row.t1_recommended_qty) + nn(row.t2_recommended_qty) + nn(row.t3_recommended_qty); }
  function isActionable(row) { return sumRecommended(row) > 0; }
  function nonActionableGate(row, opts) {
    var manual = !!(opts && opts.manual === true);
    if (manual) return { persist: true, manual: true };
    return isActionable(row) ? { persist: true, manual: false }
      : { persist: false, reason: 'NON_ACTIONABLE_ZERO_RECOMMENDATION' };
  }

  function deriveCarton(orderQty, upc) { var u = num(upc); var o = nn(orderQty); return (u && u > 0) ? Math.ceil(o / u) : ''; }

  // ---- generation: canonical Order Planning tier facts → ONE flat 53-col row (no T4, no retired snapshots) -----
  // input: { scope:{company,country,marketplace,sku,draft_purpose}, planningCycle,
  //          tiers:{ T1:{month,recommendedQty[,orderQty]}, T2:{...}, T3:{...} }, unitsPerCarton,
  //          provenance:{calculationRunId,formulaVersion,calculatedAt,sourceDataAsOf}, generationType, draftVersion, actor, now }
  function projectFlatDraftRow(input) {
    aType(isObj(input) && isObj(input.scope) && isObj(input.tiers), 'projectFlatDraftRow: scope + tiers required');
    var cycle = normalizePlanningCycleMonthly(input.planningCycle);
    var upc = num(input.unitsPerCarton);
    var prov = input.provenance || {};
    var row = {};
    V2_HEADERS.forEach(function (h) { row[h] = ''; });   // start blank → never leave undefined
    row.request_allocation_draft_id = draftId(input.scope, cycle);
    row.planning_cycle = cycle;
    row.company = str(input.scope.company); row.country = str(input.scope.country);
    row.marketplace = str(input.scope.marketplace); row.sku = str(input.scope.sku);
    row.draft_purpose = str(input.scope.draft_purpose) || 'regular';
    row.generation_type = str(input.generationType) || 'ai_plan';
    row.draft_version = (num(input.draftVersion) !== null) ? num(input.draftVersion) : 1;
    row.calculation_run_id = str(prov.calculationRunId);
    row.formula_version = str(prov.formulaVersion) || 'ORDER_PLANNING_GAP';
    row.calculated_at = str(prov.calculatedAt);
    row.source_data_as_of = str(prov.sourceDataAsOf);
    row.units_per_carton = (upc !== null) ? upc : '';
    TIERS.forEach(function (t) {
      var p = t.toLowerCase() + '_', f = input.tiers[t] || {};
      var rec = nn(f.recommendedQty);
      var ord = (f.orderQty === undefined || f.orderQty === null) ? rec : nn(f.orderQty);   // default order = suggested
      row[p + 'month'] = str(f.month);
      row[p + 'recommended_qty'] = rec;
      row[p + 'order_qty'] = ord;
      row[p + 'carton_qty'] = deriveCarton(ord, upc);
      row[p + 'status'] = 'draft';
      row[p + 'user_edited'] = false;
    });
    row.created_by = str(input.actor) || 'system';
    row.created_at = str(input.now);
    row.updated_by = row.created_by;
    row.updated_at = str(input.now);
    row.status = deriveHeaderStatus(row);
    return row;
  }

  // ---- header status derivation over SUBMITTABLE tiers (order_qty > 0). Zero-qty tiers never block -------------
  function tierSubmittable(row, t) { var p = t.toLowerCase() + '_'; return nn(row[p + 'order_qty']) > 0 && row[p + 'status'] !== 'submitted' && row[p + 'status'] !== 'cancelled'; }
  function deriveHeaderStatus(row) {
    if (str(row.status) === 'cancelled') return 'cancelled';
    var submittable = 0, submitted = 0;
    TIERS.forEach(function (t) {
      var p = t.toLowerCase() + '_';
      if (nn(row[p + 'order_qty']) > 0 && row[p + 'status'] !== 'cancelled') {
        submittable++;
        if (row[p + 'status'] === 'submitted') submitted++;
      }
    });
    if (submittable === 0 || submitted === 0) return 'draft';
    return (submitted === submittable) ? 'submitted' : 'partially_submitted';
  }

  function clone(row) { var o = {}; Object.keys(row).forEach(function (k) { o[k] = row[k]; }); return o; }

  // ---- per-tier user edit: sets order/carton/note + stamps user_edited; NEVER touches recommended_qty ---------
  function applyTierEdit(row, tier, patch, actor, now) {
    aType(TIERS.indexOf(tier) !== -1, 'applyTierEdit: bad tier ' + tier);
    var p = tier.toLowerCase() + '_', out = clone(row);
    if (out[p + 'status'] === 'submitted' || out[p + 'status'] === 'cancelled') { return { ok: false, reason: 'TIER_TERMINAL', row: out }; }
    patch = patch || {};
    if (patch.order_qty !== undefined) { out[p + 'order_qty'] = nn(patch.order_qty); out[p + 'carton_qty'] = deriveCarton(out[p + 'order_qty'], out.units_per_carton); }
    if (patch.carton_qty !== undefined) { out[p + 'carton_qty'] = nn(patch.carton_qty); }   // explicit manual carton overrides derived
    if (patch.note !== undefined) { out[p + 'note'] = str(patch.note); }
    out[p + 'user_edited'] = true; out[p + 'user_edited_by'] = str(actor);
    out.updated_by = str(actor); out.updated_at = str(now);
    out.status = deriveHeaderStatus(out);
    return { ok: true, row: out };
  }

  // ---- per-tier submit (submit_buckets on the flat row); reject 0-qty / already-terminal --------------------
  function applySubmit(row, buckets, actor, now) {
    var out = clone(row), results = {};
    (buckets || []).forEach(function (t) {
      var p = t.toLowerCase() + '_';
      if (TIERS.indexOf(t) === -1) { results[t] = 'UNKNOWN_TIER'; return; }
      if (nn(out[p + 'order_qty']) <= 0) { results[t] = 'NOT_SUBMITTABLE_ZERO_QTY'; return; }
      if (out[p + 'status'] === 'submitted') { results[t] = 'ALREADY_SUBMITTED'; return; }
      if (out[p + 'status'] === 'cancelled') { results[t] = 'TIER_CANCELLED'; return; }
      out[p + 'status'] = 'submitted'; out[p + 'submitted_by'] = str(actor); out[p + 'submitted_at'] = str(now);
      results[t] = 'SUBMITTED';
    });
    out.updated_by = str(actor); out.updated_at = str(now); out.status = deriveHeaderStatus(out);
    return { row: out, results: results };
  }
  function applyCancel(row, actor, now, reason) {
    var out = clone(row); out.status = 'cancelled'; out.cancelled_by = str(actor); out.cancelled_at = str(now);
    out.cancel_reason = str(reason); out.updated_by = str(actor); out.updated_at = str(now); return out;
  }

  // ---- REUSE / REFRESH / REGENERATE (no child rows) ----------------------------------------------------------
  function reuse(existing) { return clone(existing); }   // same id → no unnecessary mutation
  function refresh(existing, freshTiers, now) {
    var out = clone(existing);
    TIERS.forEach(function (t) {
      var p = t.toLowerCase() + '_', f = (freshTiers && freshTiers[t]) || null;
      if (!f) return;
      if (out[p + 'status'] === 'submitted' || out[p + 'status'] === 'cancelled') return;   // terminal-protected
      if (out[p + 'user_edited'] === true) return;                                            // user decision preserved
      var rec = nn(f.recommendedQty);
      out[p + 'recommended_qty'] = rec; out[p + 'order_qty'] = rec; out[p + 'carton_qty'] = deriveCarton(rec, out.units_per_carton);
      if (f.month !== undefined) out[p + 'month'] = str(f.month);
    });
    out.updated_at = str(now); out.status = deriveHeaderStatus(out);   // created_at preserved; draft_version unchanged
    return out;
  }
  function regenerate(existing, freshTiers, opts, now) {
    var confirmOverEdits = !!(opts && opts.confirmRegenerateOverUserEdits === true);
    var out = clone(existing);
    out.draft_version = (num(out.draft_version) || 1) + 1;
    TIERS.forEach(function (t) {
      var p = t.toLowerCase() + '_', f = (freshTiers && freshTiers[t]) || null;
      if (!f) return;
      if (out[p + 'status'] === 'submitted' || out[p + 'status'] === 'cancelled') return;   // terminal-protected
      if (out[p + 'user_edited'] === true && !confirmOverEdits) return;                      // needs explicit confirmation
      var rec = nn(f.recommendedQty);
      out[p + 'recommended_qty'] = rec; out[p + 'order_qty'] = rec; out[p + 'carton_qty'] = deriveCarton(rec, out.units_per_carton);
      if (out[p + 'user_edited'] === true) { out[p + 'user_edited'] = false; out[p + 'user_edited_by'] = ''; }   // overwritten by confirmed regenerate
      if (f.month !== undefined) out[p + 'month'] = str(f.month);
    });
    out.updated_at = str(now); out.status = deriveHeaderStatus(out);   // created_at preserved
    return out;
  }

  // ---- Send Request explosion: one flat row → formal VALUE lines (tiers with order_qty>0, non-terminal) -------
  function explodeSendRequestLines(row) {
    var out = [];
    TIERS.forEach(function (t) {
      var p = t.toLowerCase() + '_', q = nn(row[p + 'order_qty']);
      if (q <= 0) return;                                        // zero-qty skipped
      if (row[p + 'status'] === 'cancelled') return;             // cancelled tier excluded
      out.push({ sku: str(row.sku), company: str(row.company), country: str(row.country), marketplace: str(row.marketplace),
        request_bucket: t, request_month: str(row[p + 'month']), requested_qty: q,
        units_per_carton: row.units_per_carton, carton_qty: row[p + 'carton_qty'],
        request_allocation_draft_id: str(row.request_allocation_draft_id) });   // NO request_allocation_line_id
    });
    return out;   // T4 impossible (tier set is fixed T1/T2/T3)
  }
  // Same Send authority, driven from the flat READBACK DTO (KMRDV2P.flatReadbackDto) the frontend holds — so the UI
  // never re-derives tier eligibility. Output is byte-identical to explodeSendRequestLines(row) (proven by test).
  function explodeSendRequestLinesFromDto(dto) {
    aType(isObj(dto) && Array.isArray(dto.tiers) && isObj(dto.scope), 'explodeSendRequestLinesFromDto: flat readback DTO required');
    var out = [];
    dto.tiers.forEach(function (t) {
      var q = nn(t.orderQty);
      if (q <= 0) return;                                          // zero-qty skipped
      if (t.status === 'cancelled') return;                        // cancelled tier excluded
      out.push({ sku: str(dto.scope.sku), company: str(dto.scope.company), country: str(dto.scope.country), marketplace: str(dto.scope.marketplace),
        request_bucket: t.tier, request_month: str(t.month), requested_qty: q,
        units_per_carton: (dto.unitsPerCarton === null || dto.unitsPerCarton === undefined) ? '' : dto.unitsPerCarton,
        carton_qty: (t.cartonQty === null || t.cartonQty === undefined) ? '' : t.cartonQty,
        request_allocation_draft_id: str(dto.draftId) });          // NO request_allocation_line_id
    });
    return out;
  }

  // ---- MIGRATION classifier + flattener (legacy header + child lines → one v2 row) ---------------------------
  function idFamily(id) { var s = str(id); if (/^RD::/.test(s)) return 'RD'; if (/^RAD-/.test(s)) return 'RAD'; if (/^RAL-/.test(s)) return 'RAL'; return s ? 'UNKNOWN' : 'BLANK'; }
  function classifyLegacyDraft(header, lines) {
    lines = lines || [];
    var byTier = { T1: [], T2: [], T3: [], T4: [], OTHER: [] };
    lines.forEach(function (l) { var b = str(l.request_bucket).toUpperCase(); (byTier[b] || byTier.OTHER).push(l); });
    var reasons = [];
    if (!header) reasons.push('ORPHAN_LINE_NO_HEADER');
    if (byTier.T4.length > 0) reasons.push('T4_PRESENT');
    ['T1', 'T2', 'T3'].forEach(function (t) { if (byTier[t].length > 1) reasons.push('DUPLICATE_' + t); });
    var fam = idFamily(header && header.request_allocation_draft_id);
    if (fam === 'RAL' || fam === 'UNKNOWN') reasons.push('UNRECOGNIZED_ID_' + fam);
    var upcs = {}; lines.forEach(function (l) { var u = str(l.units_per_carton); if (u !== '') upcs[u] = 1; });
    if (Object.keys(upcs).length > 1) reasons.push('INCONSISTENT_UNITS_PER_CARTON');
    var actionable = false; lines.forEach(function (l) { if (nn(l.recommended_qty) > 0 || nn(l.order_qty) > 0) actionable = true; });
    if (header && lines.length === 0 && actionable) reasons.push('ACTIONABLE_HEADER_ZERO_LINES');
    var klass = reasons.length ? 'NEEDS_MANUAL_REVIEW' : 'MIGRATION_SAFE';
    if (fam === 'RAL') klass = 'NEEDS_MANUAL_REVIEW';   // treat test garbage as review, never silently safe
    return { classification: klass, reasons: reasons, idFamily: fam };
  }
  // BLOCKED_CONFLICT is cross-header: >1 ACTIVE header for one natural-scope key.
  var ACTIVE_HEADER = { draft: 1, partially_submitted: 1, site_confirmed: 1 };
  function detectActiveConflicts(headers) {
    var byKey = {}, conflicts = [];
    (headers || []).forEach(function (h) {
      if (!ACTIVE_HEADER[str(h.status)]) return;
      var k = [str(h.company), str(h.country), str(h.marketplace), str(h.sku), str(h.draft_purpose), str(h.planning_cycle)].join('|');
      (byKey[k] = byKey[k] || []).push(str(h.request_allocation_draft_id));
    });
    Object.keys(byKey).forEach(function (k) { if (byKey[k].length > 1) conflicts.push({ naturalScope: k, draftIds: byKey[k] }); });
    return conflicts;
  }
  function mapTierStatus_(legacy) { var s = str(legacy).toLowerCase(); if (s === 'submitted') return 'submitted'; if (s === 'cancelled') return 'cancelled'; return 'draft'; }
  function flattenLegacy(header, lines) {
    var row = {}; V2_HEADERS.forEach(function (h) { row[h] = ''; });
    header = header || {};
    ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku', 'status',
      'generation_type', 'draft_purpose', 'draft_version', 'calculation_run_id', 'formula_version', 'calculated_at',
      'source_data_as_of', 'created_by', 'created_at', 'updated_by', 'updated_at', 'cancelled_by', 'cancelled_at',
      'cancel_reason', 'note'].forEach(function (k) { if (header[k] !== undefined) row[k] = header[k]; });
    var byTier = {}; (lines || []).forEach(function (l) { byTier[str(l.request_bucket).toUpperCase()] = l; });
    var upc = '';
    TIERS.forEach(function (t) {
      var p = t.toLowerCase() + '_', l = byTier[t];
      if (!l) { row[p + 'status'] = 'draft'; row[p + 'user_edited'] = false; row[p + 'order_qty'] = 0; row[p + 'recommended_qty'] = 0; return; }
      row[p + 'month'] = str(l.request_month);
      row[p + 'recommended_qty'] = nn(l.recommended_qty);
      row[p + 'order_qty'] = nn(l.order_qty);
      row[p + 'carton_qty'] = (l.carton_qty === undefined || l.carton_qty === '') ? '' : nn(l.carton_qty);
      row[p + 'status'] = mapTierStatus_(l.line_status);
      row[p + 'submitted_by'] = str(l.submitted_by); row[p + 'submitted_at'] = str(l.submitted_at);
      row[p + 'user_edited'] = (l.user_edited === true || str(l.user_edited).toUpperCase() === 'TRUE');
      row[p + 'user_edited_by'] = str(l.user_edited_by); row[p + 'note'] = str(l.note);
      if (str(l.units_per_carton) !== '') upc = l.units_per_carton;
    });
    if (str(row.units_per_carton) === '' && upc !== '') row.units_per_carton = upc;
    row.status = str(header.status) || deriveHeaderStatus(row);
    return row;
  }

  // ---- pure aggregation behind the READ-ONLY migration diagnostic (the .gs wrapper only feeds it live rows) ---
  function summarizeMigration(headers, linesByDraftId) {
    headers = headers || []; linesByDraftId = linesByDraftId || {};
    var out = { TOTAL_HEADERS: headers.length, RD_HEADERS: 0, RAD_HEADERS: 0, UNKNOWN_HEADERS: 0,
      HEADERS_WITH_0_LINES: 0, HEADERS_WITH_1_LINE: 0, HEADERS_WITH_2_LINES: 0, HEADERS_WITH_3_LINES: 0, HEADERS_WITH_GT3_LINES: 0,
      DUPLICATE_T1: 0, DUPLICATE_T2: 0, DUPLICATE_T3: 0, T4_PRESENT: 0,
      ACTIVE: 0, PARTIALLY_SUBMITTED: 0, SUBMITTED: 0, CANCELLED: 0, ALL_ZERO: 0, ACTIONABLE: 0, USER_EDITED: 0,
      MIGRATION_SAFE: 0, NEEDS_MANUAL_REVIEW: 0, BLOCKED_CONFLICT: 0, review: [], conflicts: [] };
    var conflicts = detectActiveConflicts(headers);
    var conflictIds = {}; conflicts.forEach(function (c) { c.draftIds.forEach(function (id) { conflictIds[id] = c.naturalScope; }); });
    out.conflicts = conflicts; out.BLOCKED_CONFLICT = conflicts.reduce(function (a, c) { return a + c.draftIds.length; }, 0);
    headers.forEach(function (h) {
      var id = str(h.request_allocation_draft_id), fam = idFamily(id), lines = linesByDraftId[id] || [];
      if (fam === 'RD') out.RD_HEADERS++; else if (fam === 'RAD') out.RAD_HEADERS++; else out.UNKNOWN_HEADERS++;
      var n = lines.length;
      out['HEADERS_WITH_' + (n === 0 ? '0_LINES' : n === 1 ? '1_LINE' : n === 2 ? '2_LINES' : n === 3 ? '3_LINES' : 'GT3_LINES')]++;
      var byTier = { T1: 0, T2: 0, T3: 0, T4: 0 }; lines.forEach(function (l) { var b = str(l.request_bucket).toUpperCase(); if (byTier[b] !== undefined) byTier[b]++; });
      if (byTier.T1 > 1) out.DUPLICATE_T1++; if (byTier.T2 > 1) out.DUPLICATE_T2++; if (byTier.T3 > 1) out.DUPLICATE_T3++;
      if (byTier.T4 > 0) out.T4_PRESENT++;
      var s = str(h.status);
      if (s === 'cancelled') out.CANCELLED++; else if (s === 'submitted') out.SUBMITTED++;
      else if (s === 'partially_submitted') out.PARTIALLY_SUBMITTED++; else out.ACTIVE++;
      var actionable = false, edited = false;
      lines.forEach(function (l) { if (nn(l.recommended_qty) > 0 || nn(l.order_qty) > 0) actionable = true; if (l.user_edited === true || str(l.user_edited).toUpperCase() === 'TRUE') edited = true; });
      if (actionable) out.ACTIONABLE++; else out.ALL_ZERO++;
      if (edited) out.USER_EDITED++;
      var c = classifyLegacyDraft(h, lines);
      if (conflictIds[id]) { /* counted under BLOCKED_CONFLICT */ out.review.push({ id: id, classification: 'BLOCKED_CONFLICT', reasons: ['ACTIVE_DUPLICATE:' + conflictIds[id]] }); }
      else if (c.classification === 'MIGRATION_SAFE') out.MIGRATION_SAFE++;
      else { out.NEEDS_MANUAL_REVIEW++; out.review.push({ id: id, classification: c.classification, reasons: c.reasons }); }
    });
    // orphan lines: draftIds with lines but no header
    var headerIds = {}; headers.forEach(function (h) { headerIds[str(h.request_allocation_draft_id)] = 1; });
    out.ORPHAN_LINES = Object.keys(linesByDraftId).filter(function (id) { return !headerIds[id] && (linesByDraftId[id] || []).length > 0; }).length;
    return out;
  }

  return {
    V2_HEADERS: V2_HEADERS.slice(), TIERS: TIERS.slice(), TIER_STATUS: TIER_STATUS, HEADER_STATUS: HEADER_STATUS,
    normalizePlanningCycleMonthly: normalizePlanningCycleMonthly, scopeKey: scopeKey, draftId: draftId, naturalKey: naturalKey,
    sumRecommended: sumRecommended, isActionable: isActionable, nonActionableGate: nonActionableGate,
    projectFlatDraftRow: projectFlatDraftRow, deriveHeaderStatus: deriveHeaderStatus, tierSubmittable: tierSubmittable,
    applyTierEdit: applyTierEdit, applySubmit: applySubmit, applyCancel: applyCancel,
    reuse: reuse, refresh: refresh, regenerate: regenerate, explodeSendRequestLines: explodeSendRequestLines,
    explodeSendRequestLinesFromDto: explodeSendRequestLinesFromDto,
    classifyLegacyDraft: classifyLegacyDraft, detectActiveConflicts: detectActiveConflicts, flattenLegacy: flattenLegacy,
    summarizeMigration: summarizeMigration,
    VERSION: 'kmrdv2-fa3c-r2-1'
  };
});
