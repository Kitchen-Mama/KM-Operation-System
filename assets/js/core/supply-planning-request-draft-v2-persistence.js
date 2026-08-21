// Kitchen Mama Operation System — Request Order Allocation Draft V2 (FLATTEN) — MONTHLY_ORDER persistence SHAPE ADAPTER (F1-7N-FA-3C-DRAFT-MODEL-R2b-2).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC MONTHLY_ORDER flat-persistence SHAPE ADAPTER. It realizes the frozen coexistence contract
// (docs/planning/REQUEST_ORDER_ALLOCATION_DRAFT_V2_FLATTEN_DESIGN_FREEZE.md §17–18): MONTHLY_ORDER persists ONE flat
// 53-column request_order_allocation_drafts row (NO child lines) while WEEKLY_SHIPPING keeps the existing line engine.
//
// This module is a SHAPE ADAPTER, NOT a parallel governance engine. It REUSES the shared governance primitives from
// the canonical repository (KMPR): the optimistic-concurrency token {draft_version,userEditFingerprint} and its
// FNV-1a fingerprint, and the exact 16-column recommendation_calculation_runs journal row shape. It DELEGATES every
// business/shape/lifecycle decision to KMRDV2 (the frozen flat-draft authority: YYYY-MM normalization, deterministic
// RD identity, natural scope key, non-actionable gate, flat row projection, header-status derivation, REUSE/REFRESH/
// REGENERATE, terminal + user-edit protection, Send-Request explosion). It owns NO carton/recommendation/§41 formula,
// NO Sheets/LockService/Date.now/Math.random/locale (the caller injects now/actor + a locked apply); input never
// mutated. It NEVER reads or writes request_order_allocation_draft_lines and NEVER touches any WEEKLY table.
//
// The flat fingerprint is taken over the three per-tier decision tuples (tN_order_qty, tN_user_edited) — the flat
// analogue of the line engine's (lineKey,userQty,userEdited) tuples — so concurrency protection is preserved without
// weakening it and WEEKLY's fingerprint semantics are entirely unchanged (WEEKLY never calls this module).

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-request-draft-v2.js') : (root.KMRDV2 || (root.KM && root.KM.requestDraftV2)),
    req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.requestDraftV2Persistence = api; }
})(this, function (KMRDV2, KMPR) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function num(v) { var n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function nn(v) { var n = num(v); return (n !== null && n > 0) ? n : 0; }

  var RECOMMENDATION_TYPE = 'MONTHLY_ORDER';
  var HEADER_TABLE = 'request_order_allocation_drafts';
  var TIERS = ['T1', 'T2', 'T3'];
  var SCOPE_FIELDS = ['company', 'country', 'marketplace', 'sku', 'draft_purpose'];
  // A flat header is the ACTIVE workspace while it can still change (never once fully submitted/cancelled).
  var ACTIVE_FLAT_STATUSES = { draft: 1, partially_submitted: 1, site_confirmed: 1 };

  // ---- schema authority: derived from KMRDV2.V2_HEADERS (no hand-maintained 53-col copy → cannot drift) ---------
  // The MONTHLY_ORDER V2 authorized-table set is EXACTLY the flat drafts table + the shared run journal. It
  // explicitly EXCLUDES request_order_allocation_draft_lines and BOTH shipping tables (a stale/missing legacy line
  // schema or a stale shipping schema must never gate MONTHLY V2). A drift test pins expectedHeaders===V2_HEADERS.
  function v2TableSpecs() {
    return [
      { sheetName: HEADER_TABLE, expectedHeaders: KMRDV2.V2_HEADERS.slice(), required: true, extraColumnsPolicy: 'ALLOW' },
      { sheetName: KMPR.RUN_JOURNAL_TABLE, expectedHeaders: KMPR.RUN_JOURNAL_HEADERS.slice(), required: true, extraColumnsPolicy: 'ALLOW' }
    ];
  }
  function v2ExpectedHeaderCount() { return KMRDV2.V2_HEADERS.length; }

  // ---- shared-token reuse: flat fingerprint over the per-tier decision tuples (tN_order_qty, tN_user_edited) -----
  function tierTuples(row) {
    row = row || {};
    return TIERS.map(function (t) {
      var p = t.toLowerCase() + '_';
      return { lineKey: t, userQty: row[p + 'order_qty'], userEdited: row[p + 'user_edited'] };
    });
  }
  // expected token guards against the CURRENTLY persisted state: existing row's version + its tier fingerprint
  // (empty tuple set when the draft does not yet exist — mirrors the line engine's INSERT case).
  function expectedTokenForExisting(existingRow, newVersionIfInsert) {
    if (existingRow) return KMPR.computeExpectedToken(existingRow.draft_version, tierTuples(existingRow));
    return KMPR.computeExpectedToken(newVersionIfInsert, []);
  }

  // ---- MONTHLY fact-line → KMRDV2 tiers input (the gap facts carry request_bucket T1/T2/T3 rows) ----------------
  function tiersFromFactLines(lines) {
    var tiers = {}, upc = null;
    (lines || []).forEach(function (l) {
      var b = str(l.request_bucket || l.requestBucket).toUpperCase();
      if (TIERS.indexOf(b) === -1) return;   // T4 / unknown buckets are never persisted in the flat model
      var rec = (l.recommendedQty !== undefined) ? l.recommendedQty : l.recommended_qty;
      tiers[b] = { month: str(l.request_month || l.requestMonth), recommendedQty: nn(rec) };
      var u = num((l.snapshotRow && l.snapshotRow.units_per_carton) !== undefined ? l.snapshotRow.units_per_carton : (l.units_per_carton !== undefined ? l.units_per_carton : l.unitsPerCarton));
      if (u !== null && upc === null) upc = u;
    });
    return { tiers: tiers, unitsPerCarton: upc };
  }

  // ---- active-draft resolution over the FLAT header table (CREATE / REUSE / BLOCKED_CONFLICT) ------------------
  // cycle is always compared; a scope field is compared ONLY when the query supplies a non-blank value (so a
  // scope-level readback that omits sku/draft_purpose matches every active row for the company/country/marketplace,
  // while generation — which always supplies the full scope — still resolves the ONE exact active draft).
  function scopeMatches_(row, scope, cycle) {
    if (str(row.planning_cycle) !== str(cycle)) return false;
    for (var i = 0; i < SCOPE_FIELDS.length; i++) {
      var f = SCOPE_FIELDS[i], q = str(scope[f]);
      if (q !== '' && str(row[f]) !== q) return false;
    }
    return true;
  }
  function loadActiveFlat(sheetSet, query) {
    aType(isObj(query) && isObj(query.businessScope), 'loadActiveFlat: query.businessScope required');
    var cycle = KMRDV2.normalizePlanningCycleMonthly(query.planningCycle);
    var t = sheetSet[HEADER_TABLE]; aType(t && Array.isArray(t.headers) && Array.isArray(t.rows), 'loadActiveFlat: missing ' + HEADER_TABLE);
    var scope = query.businessScope;
    var scopeKey = KMPR.buildBusinessScopeKey(RECOMMENDATION_TYPE, {
      planning_cycle: cycle, company: str(scope.company), country: str(scope.country),
      marketplace: str(scope.marketplace), draft_purpose: str(scope.draft_purpose), sku: str(scope.sku)
    });
    var matches = t.rows.map(function (r) { return rowObj_(t.headers, r); }).filter(function (o) {
      return ACTIVE_FLAT_STATUSES[str(o.status)] === 1 && scopeMatches_(o, scope, cycle);
    });
    if (matches.length === 0) return { status: 'CREATE', activeKey: RECOMMENDATION_TYPE + '::' + scopeKey, draftId: null, businessScopeKey: scopeKey };
    if (matches.length === 1) return { status: 'REUSE', activeKey: RECOMMENDATION_TYPE + '::' + scopeKey, draftId: str(matches[0].request_allocation_draft_id), draft: matches[0], businessScopeKey: scopeKey };
    return { status: 'BLOCKED_CONFLICT', activeKey: RECOMMENDATION_TYPE + '::' + scopeKey, matchCount: matches.length, businessScopeKey: scopeKey };
  }

  // ---- plan: decide op + project the next flat row (delegating shape/lifecycle entirely to KMRDV2) -------------
  // input = { existingRow|null, scope, planningCycle, tiers|factLines, unitsPerCarton, provenance,
  //           generationType, mode, action?, confirmRegenerateOverUserEdits, actor, now, businessScopeKey }
  // mode: 'ai_plan' (AI; non-actionable CREATE is gated) | 'manual' (all-zero CREATE allowed)
  // action (existing draft): 'reuse' | 'refresh' | 'regenerate' (default 'refresh')
  function planFlat(input) {
    aType(isObj(input) && isObj(input.scope), 'planFlat: scope required');
    var cycle = KMRDV2.normalizePlanningCycleMonthly(input.planningCycle);
    var manual = input.mode === 'manual';
    var factTiers = input.tiers ? { tiers: input.tiers, unitsPerCarton: input.unitsPerCarton } : tiersFromFactLines(input.factLines);
    var tiers = factTiers.tiers;
    var upc = (input.unitsPerCarton !== undefined && input.unitsPerCarton !== null) ? input.unitsPerCarton : factTiers.unitsPerCarton;
    var existing = input.existingRow || null;

    var row, op, action;
    if (!existing) {
      action = 'create'; op = 'INSERT';
      row = KMRDV2.projectFlatDraftRow({
        scope: input.scope, planningCycle: cycle, tiers: tiers, unitsPerCarton: upc,
        provenance: input.provenance || {}, generationType: input.generationType || (manual ? 'manual' : 'ai_plan'),
        draftVersion: 1, actor: input.actor, now: input.now
      });
      // Non-actionable gate: AI never creates an all-zero draft; manual may.
      var gate = KMRDV2.nonActionableGate(row, { manual: manual });
      if (!gate.persist) return { persist: false, reason: gate.reason, action: action, op: op, draftId: row.request_allocation_draft_id };
    } else {
      action = str(input.action).toLowerCase() || 'refresh';
      op = 'UPDATE';
      if (action === 'reuse') { row = KMRDV2.reuse(existing); }
      else if (action === 'regenerate') { row = KMRDV2.regenerate(existing, tiers, { confirmRegenerateOverUserEdits: input.confirmRegenerateOverUserEdits === true }, input.now); }
      else { action = 'refresh'; row = KMRDV2.refresh(existing, tiers, input.now); }
      // provenance refresh on the flat row (never re-mints identity; created_at preserved by KMRDV2)
      if (isObj(input.provenance)) {
        if (str(input.provenance.calculationRunId)) row.calculation_run_id = str(input.provenance.calculationRunId);
        if (str(input.provenance.formulaVersion)) row.formula_version = str(input.provenance.formulaVersion);
        if (str(input.provenance.calculatedAt)) row.calculated_at = str(input.provenance.calculatedAt);
        if (str(input.provenance.sourceDataAsOf)) row.source_data_as_of = str(input.provenance.sourceDataAsOf);
      }
      row.updated_by = str(input.actor) || row.updated_by;
    }

    var draftVersion = (num(row.draft_version) !== null) ? num(row.draft_version) : 1;
    var expectedToken = expectedTokenForExisting(existing, draftVersion);
    var calcRunId = str((input.provenance && input.provenance.calculationRunId) || row.calculation_run_id) || ('RUN::' + row.request_allocation_draft_id + '::v' + draftVersion);
    row.calculation_run_id = calcRunId;
    return {
      persist: true, recommendationType: RECOMMENDATION_TYPE, action: action, op: op,
      draftId: row.request_allocation_draft_id, draftVersion: draftVersion,
      calculationRunId: calcRunId, expectedToken: expectedToken, row: row,
      runMeta: {
        planning_cycle: cycle, business_scope_key: input.businessScopeKey || '',
        formulaVersion: str(row.formula_version), sourceDataAsOf: str(row.source_data_as_of)
      }
    };
  }

  // ---- pure flat apply: token-guard → single-row upsert (NO child lines) → shared run-journal COMPLETED row -----
  function rowObj_(headers, row) { var o = {}; for (var i = 0; i < headers.length; i++) o[headers[i]] = row[i]; return o; }
  function objRow_(headers, obj) { return headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; }); }
  function findByDraftId_(t, draftId) {
    var target = -1, dup = 0;
    for (var i = 0; i < t.rows.length; i++) { var o = rowObj_(t.headers, t.rows[i]); if (str(o.request_allocation_draft_id) === str(draftId)) { dup++; if (target === -1) target = i; } }
    return { target: target, dup: dup };
  }
  function applyFlat(sheetSet, plan, expectedToken, opts) {
    aType(isObj(plan) && plan.recommendationType === RECOMMENDATION_TYPE, 'applyFlat: MONTHLY_ORDER plan required');
    aType(isObj(plan.row) && str(plan.row.request_allocation_draft_id) !== '', 'applyFlat: plan.row with draft id required');
    opts = opts || {};
    var now = opts.now !== undefined ? opts.now : '', actor = opts.actor !== undefined ? opts.actor : '';
    var hT = sheetSet[HEADER_TABLE]; aType(hT && Array.isArray(hT.headers) && Array.isArray(hT.rows), 'applyFlat: missing ' + HEADER_TABLE);
    var rT = sheetSet[KMPR.RUN_JOURNAL_TABLE]; aType(rT && Array.isArray(rT.headers) && Array.isArray(rT.rows), 'applyFlat: missing ' + KMPR.RUN_JOURNAL_TABLE);

    // ---- token revalidation against the currently persisted flat row (no write on mismatch) ----
    var found = findByDraftId_(hT, plan.draftId);
    if (found.dup > 1) return { runStatus: 'FAILED', wrote: false, reason: 'DUPLICATE_HEADER' };
    var existing = found.target === -1 ? null : rowObj_(hT.headers, hT.rows[found.target]);
    var liveVersion = existing ? existing.draft_version : expectedToken.draft_version;
    var liveToken = { draft_version: liveVersion, userEditFingerprint: KMPR.buildUserEditFingerprint(existing ? tierTuples(existing) : []) };
    if (!KMPR.tokensMatch(liveToken, expectedToken)) {
      return { runStatus: 'CONFLICT', conflict: true, wrote: false, reason: 'TOKEN_MISMATCH', expected: expectedToken, live: liveToken };
    }

    // ---- single-row upsert (never a child-line write) ----
    var writeRow = objRow_(hT.headers, plan.row);
    var action;
    if (found.target === -1) { hT.rows.push(writeRow); action = 'INSERT'; }
    else { hT.rows[found.target] = writeRow; action = 'UPDATE'; }

    // ---- shared run journal: same 16-col recommendation_calculation_runs row shape as the line engine ----
    var prev = null, ri;
    for (ri = 0; ri < rT.rows.length; ri++) { var ro = rowObj_(rT.headers, rT.rows[ri]); if (str(ro.calculation_run_id) === str(plan.calculationRunId)) { prev = ro; break; } }
    var attempt = prev ? ((parseInt(prev.attempt_count, 10) || 1) + 1) : 1;
    var runRow = {
      calculation_run_id: plan.calculationRunId, recommendation_type: RECOMMENDATION_TYPE, draft_id: plan.draftId,
      planning_cycle: (plan.runMeta && plan.runMeta.planning_cycle) || '', business_scope_key: (plan.runMeta && plan.runMeta.business_scope_key) || '',
      draft_version: plan.draftVersion, run_status: 'COMPLETED', current_stage: 'COMPLETED',
      formula_version: (plan.runMeta && plan.runMeta.formulaVersion) || '', source_data_as_of: (plan.runMeta && plan.runMeta.sourceDataAsOf) || '',
      started_by: prev ? prev.started_by : actor, started_at: prev ? prev.started_at : now,
      completed_by: actor, completed_at: now, error_summary: '', attempt_count: attempt
    };
    if (ri < rT.rows.length && prev) rT.rows[ri] = objRow_(rT.headers, runRow); else rT.rows.push(objRow_(rT.headers, runRow));

    return { runStatus: 'COMPLETED', wrote: true, action: action, draftId: plan.draftId, draftVersion: plan.draftVersion, writtenTables: [HEADER_TABLE, KMPR.RUN_JOURNAL_TABLE] };
  }

  // ---- end-to-end driver mirroring KMPW.persistProductionRecommendation(command, deps) — governance stays shared -
  // deps = { loadActiveContext(query)->{status,draft|null}, computeFacts()->{ready,reason,tiers|lines,unitsPerCarton,provenance},
  //          lockedApply(plan, expectedToken, opts)->applyResult }   (the .gs injects LockService + keyed-delta write)
  function generateMonthlyFlat(command, deps) {
    aType(isObj(command), 'generateMonthlyFlat: command required');
    aType(isObj(deps) && typeof deps.computeFacts === 'function' && typeof deps.lockedApply === 'function', 'generateMonthlyFlat: deps.computeFacts/lockedApply required');
    if (command.recommendationType !== RECOMMENDATION_TYPE) return { success: false, error: 'generateMonthlyFlat handles MONTHLY_ORDER only', stage: 'input' };
    var cycle;
    try { cycle = KMRDV2.normalizePlanningCycleMonthly(command.planningCycle); }
    catch (e) { return { success: false, error: (e && e.message) || 'INVALID_PLANNING_CYCLE', stage: 'input' }; }

    var rawScope = command.businessScope || {};
    var scope = { company: str(rawScope.company), country: str(rawScope.country), marketplace: str(rawScope.marketplace), sku: str(rawScope.sku), draft_purpose: str(rawScope.draft_purpose) || 'regular' };
    var query = { recommendationType: RECOMMENDATION_TYPE, planningCycle: cycle, businessScope: scope };
    var active = (typeof deps.loadActiveContext === 'function') ? deps.loadActiveContext(query) : { status: 'CREATE' };
    if (active && active.status === 'BLOCKED_CONFLICT') return { success: false, error: 'BLOCKED_CONFLICT', stage: 'active', matchCount: active.matchCount };

    var facts = deps.computeFacts();
    if (facts && facts.ready === false) return { success: false, error: facts.reason || 'FACTS_NOT_READY', stage: 'facts' };

    var manual = command.mode === 'manual' || command.mode === 'MANUAL';
    var action = command.action || (/REGENERATE/i.test(str(command.mode)) ? 'regenerate' : 'refresh');
    var plan = planFlat({
      existingRow: (active && active.draft) ? active.draft : null,
      scope: { company: str(scope.company), country: str(scope.country), marketplace: str(scope.marketplace), sku: str(scope.sku), draft_purpose: str(scope.draft_purpose) || 'regular' },
      planningCycle: cycle, factLines: facts && facts.lines, tiers: facts && facts.tiers,
      unitsPerCarton: facts && facts.unitsPerCarton,
      provenance: (facts && facts.provenance) || { formulaVersion: facts && facts.formulaVersion, sourceDataAsOf: facts && facts.sourceDataAsOf },
      generationType: command.generationType || (manual ? 'manual' : 'ai_plan'), mode: manual ? 'manual' : 'ai_plan',
      action: action, confirmRegenerateOverUserEdits: command.confirmRegenerateOverUserEdits === true,
      actor: command.actor || 'system', now: command.now, businessScopeKey: active && active.businessScopeKey
    });

    if (!plan.persist) return { success: true, wrote: false, persisted: false, outcome: 'NON_ACTIONABLE', reason: plan.reason, draftId: plan.draftId };

    var res = deps.lockedApply(plan, plan.expectedToken, { now: command.now, actor: command.actor || 'system', generationType: plan.row.generation_type });
    var wrote = !!(res && res.wrote === true && res.runStatus === 'COMPLETED');
    return {
      success: !!(res && (res.runStatus === 'COMPLETED')), wrote: wrote, persisted: wrote,
      outcome: res && res.conflict ? 'CONFLICT' : (wrote ? plan.action.toUpperCase() : 'NOT_EXECUTED'),
      draftId: plan.draftId, draftVersion: plan.draftVersion, action: plan.action,
      writtenTables: wrote ? [HEADER_TABLE, KMPR.RUN_JOURNAL_TABLE] : [], result: res
    };
  }

  // ---- direct-row load + plan-for-a-transformed-row (shared by edit / submit / cancel) -------------------------
  function loadFlatById(sheetSet, draftId) {
    var t = sheetSet[HEADER_TABLE]; aType(t && Array.isArray(t.headers), 'loadFlatById: missing ' + HEADER_TABLE);
    var f = findByDraftId_(t, draftId);
    if (f.dup > 1) return { status: 'BLOCKED_CONFLICT', row: null };
    if (f.target === -1) return { status: 'NOT_FOUND', row: null };
    return { status: 'FOUND', row: rowObj_(t.headers, t.rows[f.target]) };
  }
  // build the UPDATE plan for a row transformed IN PLACE by a KMRDV2 lifecycle op (edit/submit/cancel). The token
  // guards against the row as it was BEFORE the transform (existingRow); the client may override with its own token.
  function planForRow_(newRow, existingRow, opts) {
    opts = opts || {};
    var draftVersion = (num(newRow.draft_version) !== null) ? num(newRow.draft_version) : 1;
    var token = opts.expectedToken || expectedTokenForExisting(existingRow, draftVersion);
    var calcRunId = str(newRow.calculation_run_id) || ('RUN::' + newRow.request_allocation_draft_id + '::v' + draftVersion);
    newRow.calculation_run_id = calcRunId;
    return {
      persist: true, recommendationType: RECOMMENDATION_TYPE, op: 'UPDATE', action: opts.action || 'edit',
      draftId: str(newRow.request_allocation_draft_id), draftVersion: draftVersion,
      calculationRunId: calcRunId, expectedToken: token, row: newRow,
      runMeta: { planning_cycle: str(newRow.planning_cycle), business_scope_key: opts.businessScopeKey || '',
        formulaVersion: str(newRow.formula_version), sourceDataAsOf: str(newRow.source_data_as_of) }
    };
  }

  // ---- read-only concurrency token for a flat draft (client obtains it before an edit write) -------------------
  function tokenForDraft(sheetSet, draftId) {
    var r = loadFlatById(sheetSet, draftId);
    if (r.status !== 'FOUND') return { found: false, status: r.status };
    return { found: true, status: str(r.row.status) || 'draft', expectedToken: expectedTokenForExisting(r.row, r.row.draft_version) };
  }

  // ---- per-tier EDIT (order_qty / carton_qty / note) via KMRDV2.applyTierEdit; recommended_qty NEVER rewritten --
  // command = { draftId, edits:[{ naturalKey:{request_bucket[,request_month]}, fields:{order_qty?,carton_qty?,note?} }],
  //             expectedToken?, actor, now }.  deps = { loadById(draftId)->{status,row}, lockedApply(plan,token,opts) }
  function editMonthlyFlat(command, deps) {
    aType(isObj(command) && Array.isArray(command.edits), 'editMonthlyFlat: command.edits required');
    aType(isObj(deps) && typeof deps.loadById === 'function' && typeof deps.lockedApply === 'function', 'editMonthlyFlat: deps.loadById/lockedApply required');
    var ld = deps.loadById(str(command.draftId));
    if (!ld || ld.status !== 'FOUND' || !ld.row) return { success: false, error: (ld && ld.status) || 'DRAFT_NOT_FOUND', stage: 'load' };
    var before = ld.row, working = before, results = [];
    for (var i = 0; i < command.edits.length; i++) {
      var e = command.edits[i] || {}, nk = e.naturalKey || {}, tier = str(nk.request_bucket).toUpperCase();
      if (TIERS.indexOf(tier) === -1) { results.push({ tier: tier || '(none)', ok: false, reason: 'UNKNOWN_TIER' }); continue; }
      var f = e.fields || {}, patch = {};
      if (f.order_qty !== undefined) patch.order_qty = f.order_qty;
      if (f.carton_qty !== undefined) patch.carton_qty = f.carton_qty;
      if (f.note !== undefined) patch.note = f.note;
      var res = KMRDV2.applyTierEdit(working, tier, patch, command.actor || 'user', command.now);
      if (!res.ok) { results.push({ tier: tier, ok: false, reason: res.reason }); continue; }
      working = res.row; results.push({ tier: tier, ok: true });
    }
    var anyApplied = results.some(function (r) { return r.ok; });
    if (!anyApplied) return { success: false, error: 'NO_EDIT_APPLIED', stage: 'apply', results: results };
    var plan = planForRow_(working, before, { expectedToken: command.expectedToken, action: 'edit' });
    var out = deps.lockedApply(plan, plan.expectedToken, { now: command.now, actor: command.actor || 'user' });
    var wrote = !!(out && out.wrote === true && out.runStatus === 'COMPLETED');
    return { success: !!(out && out.runStatus === 'COMPLETED'), wrote: wrote, outcome: out && out.conflict ? 'CONFLICT' : (wrote ? 'EDITED' : 'NOT_EXECUTED'),
      draftId: plan.draftId, results: results, result: out };
  }

  // ---- per-tier SUBMIT via KMRDV2.applySubmit; header status re-derived by KMRDV2.deriveHeaderStatus ------------
  // command = { draftId, buckets?:['T1',...] (default: all submittable tiers), actor, now, expectedToken? }
  function submitMonthlyFlat(command, deps) {
    aType(isObj(command), 'submitMonthlyFlat: command required');
    aType(isObj(deps) && typeof deps.loadById === 'function' && typeof deps.lockedApply === 'function', 'submitMonthlyFlat: deps.loadById/lockedApply required');
    var ld = deps.loadById(str(command.draftId));
    if (!ld || ld.status !== 'FOUND' || !ld.row) return { success: false, error: (ld && ld.status) || 'DRAFT_NOT_FOUND', stage: 'load' };
    var before = ld.row;
    if (str(before.status) === 'cancelled') return { success: false, error: 'HEADER_CANCELLED', stage: 'input' };
    var buckets = (command.buckets && command.buckets.length) ? command.buckets
      : TIERS.filter(function (t) { return KMRDV2.tierSubmittable(before, t); });   // default: every submittable tier
    var sub = KMRDV2.applySubmit(before, buckets, command.actor || 'user', command.now);
    var anySubmitted = Object.keys(sub.results).some(function (k) { return sub.results[k] === 'SUBMITTED'; });
    if (!anySubmitted) return { success: false, error: 'NO_TIER_SUBMITTED', stage: 'apply', results: sub.results, headerStatus: sub.row.status };
    var plan = planForRow_(sub.row, before, { expectedToken: command.expectedToken, action: 'submit' });
    var out = deps.lockedApply(plan, plan.expectedToken, { now: command.now, actor: command.actor || 'user' });
    var wrote = !!(out && out.wrote === true && out.runStatus === 'COMPLETED');
    return { success: !!(out && out.runStatus === 'COMPLETED'), wrote: wrote, outcome: out && out.conflict ? 'CONFLICT' : (wrote ? 'SUBMITTED' : 'NOT_EXECUTED'),
      draftId: plan.draftId, results: sub.results, headerStatus: sub.row.status, result: out };
  }

  // ---- whole-draft CANCEL via KMRDV2.applyCancel (header + all tiers terminal; no line deletion) ---------------
  function cancelMonthlyFlat(command, deps) {
    aType(isObj(command), 'cancelMonthlyFlat: command required');
    aType(isObj(deps) && typeof deps.loadById === 'function' && typeof deps.lockedApply === 'function', 'cancelMonthlyFlat: deps.loadById/lockedApply required');
    var ld = deps.loadById(str(command.draftId));
    if (!ld || ld.status !== 'FOUND' || !ld.row) return { success: false, error: (ld && ld.status) || 'DRAFT_NOT_FOUND', stage: 'load' };
    var before = ld.row;
    var cancelled = KMRDV2.applyCancel(before, command.actor || 'user', command.now, command.reason);
    var plan = planForRow_(cancelled, before, { expectedToken: command.expectedToken, action: 'cancel' });
    var out = deps.lockedApply(plan, plan.expectedToken, { now: command.now, actor: command.actor || 'user' });
    var wrote = !!(out && out.wrote === true && out.runStatus === 'COMPLETED');
    return { success: !!(out && out.runStatus === 'COMPLETED'), wrote: wrote, outcome: out && out.conflict ? 'CONFLICT' : (wrote ? 'CANCELLED' : 'NOT_EXECUTED'), draftId: plan.draftId, result: out };
  }

  // ---- Send Request body from a flat readback DTO (delegates the eligible-tier authority to KMRDV2) -------------
  function buildSendRequestLines(dto) { return KMRDV2.explodeSendRequestLinesFromDto(dto); }

  // ---- flat readback DTO (reads request_order_allocation_drafts ONLY — no join to child lines) ------------------
  function tierDto_(row, t) {
    var p = t.toLowerCase() + '_';
    return {
      tier: t, month: str(row[p + 'month']), recommendedQty: nn(row[p + 'recommended_qty']),
      orderQty: nn(row[p + 'order_qty']), cartonQty: (row[p + 'carton_qty'] === '' || row[p + 'carton_qty'] === undefined) ? null : nn(row[p + 'carton_qty']),
      status: str(row[p + 'status']) || 'draft', submittedBy: str(row[p + 'submitted_by']), submittedAt: str(row[p + 'submitted_at']),
      userEdited: (row[p + 'user_edited'] === true || str(row[p + 'user_edited']).toUpperCase() === 'TRUE'),
      userEditedBy: str(row[p + 'user_edited_by']), note: str(row[p + 'note'])
    };
  }
  function flatReadbackDto(row) {
    aType(isObj(row), 'flatReadbackDto: row required');
    return {
      recommendationType: RECOMMENDATION_TYPE,
      draftId: str(row.request_allocation_draft_id), planningCycle: str(row.planning_cycle),
      scope: { company: str(row.company), country: str(row.country), marketplace: str(row.marketplace), sku: str(row.sku), draftPurpose: str(row.draft_purpose) || 'regular' },
      status: str(row.status) || 'draft', generationType: str(row.generation_type), draftVersion: (num(row.draft_version) !== null) ? num(row.draft_version) : 1,
      provenance: { calculationRunId: str(row.calculation_run_id), formulaVersion: str(row.formula_version), calculatedAt: str(row.calculated_at), sourceDataAsOf: str(row.source_data_as_of) },
      unitsPerCarton: (num(row.units_per_carton) !== null) ? num(row.units_per_carton) : null,
      tiers: TIERS.map(function (t) { return tierDto_(row, t); }),
      audit: { createdBy: str(row.created_by), createdAt: str(row.created_at), updatedBy: str(row.updated_by), updatedAt: str(row.updated_at), cancelledBy: str(row.cancelled_by), cancelledAt: str(row.cancelled_at), cancelReason: str(row.cancel_reason) },
      note: str(row.note)
    };
  }
  // scope-level flat readback: active flat rows for a query → DTOs (header table only, NEVER the child-line table)
  function readActiveFlatForScope(sheetSet, query) {
    var t = sheetSet[HEADER_TABLE]; aType(t && Array.isArray(t.headers), 'readActiveFlatForScope: missing ' + HEADER_TABLE);
    var cycle = KMRDV2.normalizePlanningCycleMonthly(query.planningCycle);
    var scope = query.businessScope || {};
    return t.rows.map(function (r) { return rowObj_(t.headers, r); })
      .filter(function (o) { return ACTIVE_FLAT_STATUSES[str(o.status)] === 1 && scopeMatches_(o, scope, cycle); })
      .map(flatReadbackDto);
  }

  // ---- R4 one-time MIGRATION planner (pure; orchestrates the frozen KMRDV2 authority — no second algorithm) -----
  // Legacy {headers[], linesByDraftId} → the exact staging population for request_order_allocation_drafts_v2:
  //   * drift-gate against the accepted R3 shape (halt on any change),
  //   * select ONLY actionable headers (frozen classifier notion; proven == has-lines for the accepted set),
  //   * flatten each via KMRDV2.flattenLegacy (ids PRESERVED VERBATIM — never re-minted),
  //   * hard-gate the submitted population.
  // Returns { ok, halt?, summary, report, stagingHeaders, stagingRows }. Mutates nothing.
  function draftActionable_(lines) { var a = false; (lines || []).forEach(function (l) { if (nn(l.recommended_qty) > 0 || nn(l.order_qty) > 0) a = true; }); return a; }
  function planMigration(headers, linesByDraftId, opts) {
    headers = headers || []; linesByDraftId = linesByDraftId || {}; opts = opts || {};
    var expect = opts.expect || {};
    var summary = KMRDV2.summarizeMigration(headers, linesByDraftId);
    // ---- drift gate: the live set must still match the accepted R3 shape ----
    var checks = [
      ['TOTAL_HEADERS', summary.TOTAL_HEADERS], ['ACTIONABLE', summary.ACTIONABLE], ['ALL_ZERO', summary.ALL_ZERO],
      ['NEEDS_MANUAL_REVIEW', summary.NEEDS_MANUAL_REVIEW], ['BLOCKED_CONFLICT', summary.BLOCKED_CONFLICT],
      ['ORPHAN_LINES', summary.ORPHAN_LINES], ['DUPLICATE_T1', summary.DUPLICATE_T1], ['DUPLICATE_T2', summary.DUPLICATE_T2],
      ['DUPLICATE_T3', summary.DUPLICATE_T3], ['T4_PRESENT', summary.T4_PRESENT]
    ];
    var drift = [];
    checks.forEach(function (c) { if (expect[c[0]] !== undefined && Number(expect[c[0]]) !== Number(c[1])) drift.push({ field: c[0], expected: expect[c[0]], live: c[1] }); });
    if (summary.NEEDS_MANUAL_REVIEW > 0 || summary.BLOCKED_CONFLICT > 0) drift.push({ field: 'UNSAFE_ROWS', expected: 0, live: summary.NEEDS_MANUAL_REVIEW + summary.BLOCKED_CONFLICT });
    if (drift.length) return { ok: false, halt: 'R4_LIVE_DATA_DRIFT_FROM_R3', summary: summary, drift: drift };

    // ---- select actionable headers + flatten (ids verbatim) ----
    var stagingRows = [], preservedIds = 0, convertedIds = 0, rd = 0, rad = 0, submittedMigrated = 0, hasLines = 0;
    var submittedExpected = 0, seenId = {}, dupSelect = 0;
    headers.forEach(function (h) {
      var id = str(h.request_allocation_draft_id), lines = linesByDraftId[id] || [];
      if (str(h.status) === 'submitted') submittedExpected++;
      if (lines.length > 0) hasLines++;
      if (!draftActionable_(lines)) return;   // drop non-actionable (all-zero) from V2
      var row = KMRDV2.flattenLegacy(h, lines);
      if (str(row.request_allocation_draft_id) === id && id !== '') preservedIds++; else convertedIds++;
      if (seenId[id]) dupSelect++; seenId[id] = 1;
      var fam = /^RD::/.test(id) ? 'RD' : (/^RAD-/.test(id) ? 'RAD' : 'OTHER');
      if (fam === 'RD') rd++; else if (fam === 'RAD') rad++;
      if (str(row.status) === 'submitted') submittedMigrated++;
      stagingRows.push(row);
    });
    // ---- hard gates ----
    if (convertedIds !== 0) return { ok: false, halt: 'MIGRATION_ID_CONVERTED', summary: summary, convertedIds: convertedIds };
    if (dupSelect !== 0) return { ok: false, halt: 'MIGRATION_DUPLICATE_ID', summary: summary };
    if (expect.SUBMITTED !== undefined && submittedExpected !== Number(expect.SUBMITTED)) return { ok: false, halt: 'R4_LIVE_DATA_DRIFT_FROM_R3', summary: summary, drift: [{ field: 'SUBMITTED', expected: expect.SUBMITTED, live: submittedExpected }] };
    if (submittedMigrated !== submittedExpected) return { ok: false, halt: 'SUBMITTED_NOT_FULLY_MIGRATED', summary: summary, submittedExpected: submittedExpected, submittedMigrated: submittedMigrated };
    if (stagingRows.length !== summary.ACTIONABLE) return { ok: false, halt: 'ACTIONABLE_SELECTION_MISMATCH', summary: summary, selected: stagingRows.length };
    if (hasLines !== summary.ACTIONABLE) return { ok: false, halt: 'HAS_LINES_NE_ACTIONABLE', summary: summary, hasLines: hasLines };   // proves the R3 equivalence still holds

    var report = {
      SOURCE_HEADERS: headers.length, ACTIONABLE: summary.ACTIONABLE,
      NON_ACTIONABLE_DROPPED_FROM_V2: summary.ALL_ZERO, MIGRATE_ROWS: stagingRows.length,
      SUBMITTED_SOURCE: submittedExpected, SUBMITTED_MIGRATED: submittedMigrated,
      RD_MIGRATED: rd, RAD_MIGRATED: rad, PRESERVED_IDS: preservedIds, CONVERTED_IDS: convertedIds,
      TARGET_HEADERS: KMRDV2.V2_HEADERS.length, TARGET_ROWS: stagingRows.length
    };
    return { ok: true, summary: summary, report: report, stagingHeaders: KMRDV2.V2_HEADERS.slice(), stagingRows: stagingRows };
  }

  // ---- R4 READ-ONLY staging validator: independently verify request_order_allocation_drafts_v2 before the swap ---
  // stagingHeaders/stagingRows = the written staging tab; sourceHeaders/sourceLinesByDraftId = the untouched legacy.
  function validateStaging(stagingHeaders, stagingRows, sourceHeaders, sourceLinesByDraftId, opts) {
    opts = opts || {}; sourceHeaders = sourceHeaders || []; sourceLinesByDraftId = sourceLinesByDraftId || {};
    var V = KMRDV2.V2_HEADERS;
    var schemaOk = Array.isArray(stagingHeaders) && stagingHeaders.length === V.length && stagingHeaders.join('|') === V.join('|');
    // no retired columns present
    var retired = ['request_allocation_line_id', 'category_snapshot', 'series_snapshot', 't4_month', 't4_order_qty', 'net_order_need_snapshot', 'factory_available_qty_snapshot'];
    var noRetired = (stagingHeaders || []).every(function (h) { return retired.indexOf(h) === -1 && !/^t4_/.test(h); });
    schemaOk = schemaOk && noRetired;
    var expectRows = (opts.expectRows !== undefined) ? Number(opts.expectRows) : null;
    var rowCountOk = expectRows === null ? (stagingRows.length > 0) : (stagingRows.length === expectRows);
    // id set + uniqueness
    var ids = {}, idDup = 0; stagingRows.forEach(function (r) { var id = str(r.request_allocation_draft_id); if (ids[id]) idDup++; ids[id] = 1; });
    var idSetOk = idDup === 0 && Object.keys(ids).length === stagingRows.length;
    // submitted present: every source submitted id appears in staging
    var srcSubmitted = sourceHeaders.filter(function (h) { return str(h.status) === 'submitted'; }).map(function (h) { return str(h.request_allocation_draft_id); });
    var submittedSetOk = srcSubmitted.every(function (id) { return ids[id] === 1; });
    // natural-scope uniqueness among ACTIVE migrated rows (no duplicate active scope)
    var scopeSeen = {}, scopeDup = 0;
    stagingRows.forEach(function (r) {
      if (ACTIVE_FLAT_STATUSES[str(r.status)] !== 1) return;
      var k = SCOPE_FIELDS.map(function (f) { return str(r[f]); }).join('|') + '|' + str(r.planning_cycle);
      if (scopeSeen[k]) scopeDup++; scopeSeen[k] = 1;
    });
    var naturalScopeOk = scopeDup === 0;
    // tier values match the source lines (order/recommended/status per bucket) for each migrated id
    var tierOk = true;
    stagingRows.forEach(function (r) {
      var id = str(r.request_allocation_draft_id), lines = sourceLinesByDraftId[id] || [], byB = {};
      lines.forEach(function (l) { byB[str(l.request_bucket).toUpperCase()] = l; });
      TIERS.forEach(function (t) {
        var p = t.toLowerCase() + '_', l = byB[t];
        if (!l) { if (nn(r[p + 'order_qty']) !== 0 || nn(r[p + 'recommended_qty']) !== 0) tierOk = false; return; }
        if (nn(r[p + 'order_qty']) !== nn(l.order_qty)) tierOk = false;
        if (nn(r[p + 'recommended_qty']) !== nn(l.recommended_qty)) tierOk = false;
      });
    });
    var ready = schemaOk && rowCountOk && idSetOk && submittedSetOk && naturalScopeOk && tierOk;
    return { SCHEMA_OK: schemaOk, ROW_COUNT_OK: rowCountOk, ID_SET_OK: idSetOk, SUBMITTED_SET_OK: submittedSetOk,
      TIER_VALUES_OK: tierOk, NATURAL_SCOPE_OK: naturalScopeOk, READY_FOR_SWAP: ready ? 'YES' : 'NO' };
  }

  return {
    RECOMMENDATION_TYPE: RECOMMENDATION_TYPE, HEADER_TABLE: HEADER_TABLE,
    v2TableSpecs: v2TableSpecs, v2ExpectedHeaderCount: v2ExpectedHeaderCount,
    tierTuples: tierTuples, expectedTokenForExisting: expectedTokenForExisting,
    tiersFromFactLines: tiersFromFactLines, loadActiveFlat: loadActiveFlat, loadFlatById: loadFlatById,
    planFlat: planFlat, applyFlat: applyFlat, generateMonthlyFlat: generateMonthlyFlat,
    tokenForDraft: tokenForDraft, editMonthlyFlat: editMonthlyFlat, submitMonthlyFlat: submitMonthlyFlat,
    cancelMonthlyFlat: cancelMonthlyFlat, buildSendRequestLines: buildSendRequestLines,
    flatReadbackDto: flatReadbackDto, readActiveFlatForScope: readActiveFlatForScope,
    planMigration: planMigration, validateStaging: validateStaging,
    VERSION: 'kmrdv2p-fa3c-r4-1'
  };
});
