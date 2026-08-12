// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 47_api_v1_recommendation_generation.gs — F1-4B-FM6 Recommendation Generation (automatic entry points)
// NOTE: All .gs files in this folder share ONE global scope in the Apps Script project. Copy them together and
//       REDEPLOY. No imports. Structure-only split. Requires the bundle (KMREC) + 43 (gap read owners) loaded.
// ============================================================
//
// AUTOMATIC recommendation generation entry points. They READ the already-materialized gap tables and run the
// SAME canonical Phase-1 generator (KMREC, bundled) that the manual "AI Plan" buttons use — one owner, manual +
// automatic. This layer is DECISION OUTPUT only: it recalculates NO gap, owns NO formula, invokes NO
// KMHP/KMTPP/KMCALC/KMALLOC/KMMSA, and writes NO PO / shipment / execution / inventory / forecast / gap row.
// Phase-1 is UNSCHEDULED and NON-PERSISTENT — these callables produce a compact deterministic summary (counts +
// lineage), the future scheduler/persistence hook. The gap tables remain the single calculation authority.
//
// HARD LIMITS (F1-4B-FM6): NO gap recalculation, NO second formula engine, NO DB/schema change, NO downstream
// write, NO scheduler wiring this round. READY rows only yield actionable recommendations; BLOCKED/ERROR never
// fabricate a quantity (enforced inside KMREC).
//
// F1-4B-FM6-R1V (readiness gate): runRecommendationGeneration now FAILS CLOSED unless the product's durable gap
// materialization job is DONE (or absent) — it never consumes a partially-refreshed gap table from an in-flight /
// failed job. This is a READ-ONLY precondition over the 46.gs job state; still NO persistence, NO scheduler.

// Read the STORED gap rows for a product (READ ONLY; header-mapped objects; [] when the table is absent/empty).
// ORDER_PLANNING: additively stamp units_per_carton onto each row from sku_details — the single UPC authority the
// manual page also uses (F1-4B-FM5-R1) — so KMREC can cartonize the actionable total ONCE. READ ONLY: no gap
// recalculation, no schema change (units_per_carton is NOT persisted to order_planning_gap), parity with manual.
function recGenReadGapRows_(product) {
  var io = gapMaterializationDefaultIo_();
  var ss = io.openTarget();
  var table = (product === 'ORDER_PLANNING') ? OP_GAP_TABLE_ : INV_GAP_TABLE_;
  var rows = gapReadObjects_(ss, table);   // reuses the 43 read helper — no calculation, no whole-DB load
  if (product === 'ORDER_PLANNING' && rows && rows.length) {
    var upcBySku = recGenUpcBySku_(ss);
    for (var i = 0; i < rows.length; i++) {
      var u = upcBySku[String(rows[i] && rows[i].sku)];
      if (u != null && rows[i].units_per_carton == null) rows[i].units_per_carton = u;   // additive; never overwrite
    }
  }
  return rows;
}
// sku → units_per_carton map from sku_details (READ ONLY). Only finite, positive values are kept.
function recGenUpcBySku_(ss) {
  var map = {};
  var rows = gapReadObjects_(ss, 'sku_details');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]; if (!r || r.sku == null) continue;
    var n = Number(r.units_per_carton);
    if (isFinite(n) && n > 0) map[String(r.sku)] = n;
  }
  return map;
}

// F1-4B-FM6-R1V §11 — GAP-DONE readiness gate (PURE decision over the durable gap-job state). Recommendation
// generation must NEVER consume a partially-refreshed gap table: it is READY only when the product's gap
// materialization job is terminal-complete (DONE) or absent (NONE = no in-flight job → a complete cycle). Any
// in-flight / failed state (PENDING / RUNNING / FAILED / BLOCKED / ERROR — STALLED is a client-only concept, never
// durable) DEFERS generation. This is the precondition the FUTURE automation round (GAP_DONE → recommendation) relies
// on; NO scheduler is wired here. Manual AI Plan is unaffected (it renders already-loaded rows client-side).
function recGenGapReadyFromState_(state) {
  var status = (state && state.status) ? String(state.status) : 'NONE';
  return { ready: (status === 'NONE' || status === 'DONE'), status: status };
}
// Read the durable gap-job state via the canonical 46.gs owner (Script Properties); null when unavailable/absent.
function recGenReadGapJobState_(product) {
  try { return gapJobReadState_(gapJobDefaultEnv_(product), product); } catch (e) { return null; }
}

// Shared canonical owner (§8): manual AI Plan (client-side KMREC over the loaded gap rows) and this automatic path
// BOTH call KMREC — one generator. Returns a compact summary envelope; NO per-SKU payload is written anywhere.
function runRecommendationGeneration(product) {
  var p = String(product == null ? '' : product).trim().toUpperCase();
  if (p === 'INV' || p === 'INVENTORY_REPLENISHMENT') p = 'INVENTORY';
  if (p === 'OP' || p === 'ORDERPLANNING') p = 'ORDER_PLANNING';
  if (p !== 'INVENTORY' && p !== 'ORDER_PLANNING') return { ok: false, code: 'INVALID_PRODUCT', message: 'product required (INVENTORY|ORDER_PLANNING)' };
  if (typeof KMREC === 'undefined' || !KMREC || typeof KMREC.generateBatch !== 'function') return { ok: false, code: 'KMREC_NOT_BUNDLED', message: 'recommendation generator not bundled' };
  // §11 fail-closed: never generate a recommendation from an incomplete/failed gap cycle (partial rows).
  var ready = recGenGapReadyFromState_(recGenReadGapJobState_(p));
  if (!ready.ready) return { ok: false, code: 'GAP_JOB_NOT_DONE', message: 'gap materialization job is ' + ready.status + '; recommendation deferred until DONE', product: p, jobStatus: ready.status };
  try {
    var rows = recGenReadGapRows_(p);
    var res = KMREC.generateBatch(p, rows, {});   // SAME owner + rules as the manual button (earliest-window / per-tier / no-total)
    var summary = res.summary || {};
    try { Logger.log('[recGen] ' + JSON.stringify(summary)); } catch (_l) {}
    return { ok: true, product: p, sourceType: (p === 'ORDER_PLANNING' ? KMREC.SOURCE_TYPE.ORDER_PLANNING : KMREC.SOURCE_TYPE.INVENTORY), summary: summary };
  } catch (e) {
    return { ok: false, code: 'RECOMMENDATION_GENERATION_ERROR', message: (e && e.message ? String(e.message) : String(e)) };
  }
}
// Named entry points (attach to a FUTURE time trigger; NOT scheduled this round). Both delegate to the one owner.
function runInventoryRecommendationGeneration() { return runRecommendationGeneration('INVENTORY'); }
function runOrderPlanningRecommendationGeneration() { return runRecommendationGeneration('ORDER_PLANNING'); }

// F1-6A-WEEKLY-RECOMMENDATION-SCHEDULER-R1 — the Weekly Recommendation TRIGGER TARGET (wired to the Administration
// automation schedule via 45_'s registry). THIN execution/timing owner ONLY: it resolves the canonical deterministic
// planning cycle, then delegates to the ONE shared recommendation owner (runRecommendationGeneration → KMREC, the
// SAME generator the manual AI Plan uses). It authors NO recommendation / gap / forecast / inventory math and writes
// nothing itself. Because the shared owner is a NON-PERSISTENT summary that is gap-DONE gated, a duplicate trigger
// firing, a near-simultaneous second execution, a Run-Now collision, or a retry after timeout are all inherently
// idempotent (no draft is written, so no duplicate active draft can be produced). Defensive: no-op unless the job is
// still enabled in the canonical config (the trigger lifecycle already guarantees this; re-checked to survive a
// stale/orphan trigger left by a schedule edit). Runs both planning products; each is independently deferred by its
// own gap-DONE gate inside the owner.
function runWeeklyRecommendation() {
  // Defensive enabled gate — the reconciler only creates this trigger when enabled and deletes it when disabled, so
  // this is belt-and-suspenders against an orphan trigger. Never throws.
  try {
    var cfg = automationReadConfig_(automationDefaultIo_());
    if (!cfg || !cfg.weeklyRecommendation || cfg.weeklyRecommendation.enabled !== true) {
      return { ok: true, skipped: true, reason: 'WEEKLY_RECOMMENDATION_DISABLED' };
    }
  } catch (e) { /* config unavailable → fall through and let the owner's own gates decide */ }
  var out = { ok: false, handlerVersion: 'f1-6a-weekly-recommendation-r1', results: {} };
  ['INVENTORY', 'ORDER_PLANNING'].forEach(function (p) {
    // Deterministic planning cycle (Asia/Taipei, RECO-YYYY-MM) via the canonical gap calc-context resolver — the
    // scheduler SUPPLIES the cycle for observability/lineage; the runtime never guesses it. (43_ owner.)
    var cycle = '';
    try { var ctx = gapCalcResolveContext_(p); if (ctx && ctx.ok) cycle = ctx.planningCycle; } catch (e2) {}
    var res = runRecommendationGeneration(p);   // ONE canonical owner — no second engine, no math here
    out.results[p] = { planningCycle: cycle, result: res };
    if (res && res.ok) out.ok = true;
  });
  try { Logger.log('[runWeeklyRecommendation] ' + JSON.stringify(out)); } catch (_l) {}
  return out;
}

// ============================================================
// F1-4B-FM6-R4E2 — Request Order Draft Snapshot Completeness (gap authority → canonical persisted draft).
// BACKEND CONTRACT ONLY: a gap-backed MONTHLY_ORDER draft generation path + an active-draft read-back. NO frontend
// wiring, NO Order Allocation reroute, NO Send Request change (§9/§10). Persistence remains owned by the existing
// locked writer (KMPW/KMPR via 24_handleGenerateRecommendationDraftLocked_) — this layer only supplies verbatim
// gap-backed facts through the existing body.facts seam (rpoResolveFacts_), so KMSF/calculateGap is NEVER entered
// for this path. NO gap recalculation, NO second formula, NO factory reallocation, NO cartonization beyond the
// existing canonical representation (recommended_qty / units_per_carton). Fails closed on a missing/BLOCKED/not-DONE
// gap. Schema is unchanged: every column written already exists on request_order_allocation_draft_lines.
// ============================================================

// __GAPDRAFT_PURE_START__
// PURE mapping: one stored order_planning_gap ROW (+ canonical UPC) → the verbatim MONTHLY_ORDER draft facts the
// existing persister consumes (projectLine shape: snake_case natural-key columns + numeric recommendedQty +
// snapshotRow of extra persisted columns). recommended_qty = tN_suggested_qty VERBATIM (already the canonical
// carton-rounded recommendation — NO calculateSuggestedOrderQty, NO second ceiling). calculated_gap_qty_snapshot =
// tN_gap_qty. T1/T2/T3 only — T4 is forward-visibility and NEVER becomes an actionable line. Returns
// { ready:true, lines, sku } or { ready:false, reason } (fail closed). No DB, no clock, no formula.
var R4E2_ACTIONABLE_TIERS_ = ['T1', 'T2', 'T3'];   // T4 is forward-visibility only — never an actionable draft line
function r4e2Num_(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function r4e2Str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function recGenMapGapRowToFacts_(gapRow, upc) {
  if (!gapRow) return { ready: false, reason: 'ORDER_PLANNING_GAP_NOT_READY' };
  if (r4e2Str_(gapRow.calculation_status).toUpperCase() !== 'READY') return { ready: false, reason: 'ORDER_PLANNING_GAP_NOT_READY' };
  if (!r4e2Str_(gapRow.calculated_at)) return { ready: false, reason: 'ORDER_PLANNING_GAP_NOT_READY' };   // §6: a valid row carries its calc timestamp
  var u = Number(upc);
  if (!(isFinite(u) && u > 0 && Math.floor(u) === u)) return { ready: false, reason: 'UNITS_PER_CARTON_UNAVAILABLE' };   // canonical sku_details UPC required
  var sku = r4e2Str_(gapRow.sku);
  var lines = [];
  for (var i = 0; i < R4E2_ACTIONABLE_TIERS_.length; i++) {
    var t = R4E2_ACTIONABLE_TIERS_[i], lc = t.toLowerCase();   // 'T1' → 't1'
    var month = r4e2Str_(gapRow[lc + '_month']);
    if (!month) return { ready: false, reason: 'ORDER_PLANNING_GAP_NOT_READY' };                          // required actionable tier month
    var suggested = r4e2Num_(gapRow[lc + '_suggested_qty']);
    if (suggested === null || suggested < 0) return { ready: false, reason: 'ORDER_PLANNING_GAP_NOT_READY' };  // 0 is valid (no order needed); blank/negative is not
    var gap = r4e2Num_(gapRow[lc + '_gap_qty']);
    lines.push({
      request_month: month, request_bucket: t,                 // snake_case natural key (projectLine reads f[lineKey])
      recommendedQty: suggested,                               // VERBATIM tN_suggested_qty — no re-cartonization
      demandKey: sku + '|' + month + '|' + t,
      snapshotRow: {                                           // extra persisted columns (all pass the live-analysis boundary; none are forbidden keys)
        calculated_gap_qty_snapshot: (gap === null ? '' : gap),
        units_per_carton: u,
        carton_qty: suggested / u,                             // existing canonical representation (recommended_qty / UPC); whole cartons for a carton-multiple
        allocation_method: 'ORDER_PLANNING_GAP'               // lineage marker — this draft's quantity authority is the materialized gap
      }
    });
  }
  return { ready: true, lines: lines, sku: sku };
}

// PURE: build the exact body the locked generate core consumes for one gap-backed SKU. Returns { ok:true, body } or
// { ok:false, reason }. recommendation quantity + snapshot come VERBATIM from the gap row (recGenMapGapRowToFacts_);
// this only shapes the persister command (scope + mode + facts). No DB, no formula.
function recGenBuildGapDraftBody_(scope1, gapRow, upc, opts) {
  var built = recGenMapGapRowToFacts_(gapRow, upc);
  if (!built.ready) return { ok: false, reason: built.reason || 'ORDER_PLANNING_GAP_NOT_READY' };
  var sourceCalculatedAt = r4e2Str_(gapRow.calculated_at) || r4e2Str_(gapRow.updated_at);
  return { ok: true, body: {
    recommendationType: 'MONTHLY_ORDER',
    mode: (opts && opts.mode) || 'MANUAL_REGENERATE',
    planningCycle: (opts && opts.planningCycle) || r4e2Str_(gapRow.calculation_month) || '',
    businessScope: { company: scope1.company, country: scope1.country, marketplace: scope1.marketplace, sku: scope1.sku,
      draft_purpose: (opts && opts.draft_purpose) || 'regular' },
    confirmRegenerateOverUserEdits: !!(opts && opts.confirmRegenerateOverUserEdits === true),
    actor: (opts && opts.actor) || 'system',
    facts: { lines: built.lines, ready: true, formulaVersion: 'ORDER_PLANNING_GAP', sourceDataAsOf: sourceCalculatedAt }
  } };
}

// PURE: map the locked-writer PLAIN result (from rpoGenerateRecommendationDraftLockedResult_) → a COMPACT per-SKU
// batch outcome { sku, status, draftId?, code? }. Reuses the exact R4E2 semantics surfaced by KMORCH/KMPW:
// COMPLETED→CREATED/REUSED/REGENERATED (by coreAction); BLOCKED_CONFLICT with reason DUPLICATE/FOREIGN/CONFIRMATION.
function recGenSummarizeDraftResult_(sku, res) {
  var d = (res && res.data) || {};
  if (res && res.success === true && d.status === 'COMPLETED') {
    var st = (d.coreAction === 'CREATE') ? 'CREATED' : (d.coreAction === 'REFRESH') ? 'REUSED' : (d.coreAction === 'REGENERATE') ? 'REGENERATED' : 'GENERATED';
    return { sku: sku, status: st, draftId: d.draftId || null };
  }
  var reason = d.reason || (res && res.error) || 'GENERATION_FAILED';
  if (reason === 'REGENERATE_NEEDS_CONFIRMATION') return { sku: sku, status: 'REGENERATE_NEEDS_CONFIRMATION', code: reason, draftId: d.draftId || null };
  if (d.status === 'BLOCKED_CONFLICT' || reason === 'DUPLICATE_ACTIVE_DRAFT' || reason === 'FOREIGN_DRAFT_ADOPT_REQUIRED') return { sku: sku, status: 'BLOCKED_CONFLICT', code: String(reason) };
  if (String(reason).indexOf('SOURCE_NOT_READY') === 0) return { sku: sku, status: 'NOT_READY', code: String(reason) };
  return { sku: sku, status: 'FAILED', code: String(reason) };
}

// PURE: eligible-SKU enumeration for a scope = the STORED order_planning_gap rows for {company,country,marketplace}
// with calculation_status READY, sorted SKU ASC (deterministic). This is the scope job's SKU-snapshot authority
// (§5/§15) — a materialized READY gap row is the eligibility signal, never a frontend cache. Returns [{sku,row}].
function recGenEnumerateEligibleGapRows_(allGapRows, scope) {
  var lc = function (v) { return r4e2Str_(v).toLowerCase(); };
  var company = lc(scope.company), country = lc(scope.country), marketplace = lc(scope.marketplace);
  var out = [];
  for (var i = 0; i < (allGapRows || []).length; i++) {
    var r = allGapRows[i];
    if (lc(r.company) !== company || lc(r.country) !== country || lc(r.marketplace) !== marketplace) continue;
    if (r4e2Str_(r.calculation_status).toUpperCase() !== 'READY') continue;
    var sku = r4e2Str_(r.sku); if (!sku) continue;
    out.push({ sku: sku, row: r });
  }
  out.sort(function (a, b) { return a.sku < b.sku ? -1 : (a.sku > b.sku ? 1 : 0); });
  return out;
}

// PURE read-back assembly helpers (over already-read draft header/line rows). T1/T2/T3 only; T4 never appears.
function recGenReadbackLineDto_(l) {
  return { request_month: r4e2Str_(l.request_month), request_bucket: r4e2Str_(l.request_bucket),
    calculated_gap_qty_snapshot: r4e2Num_(l.calculated_gap_qty_snapshot),
    recommended_qty: r4e2Num_(l.recommended_qty), order_qty: r4e2Num_(l.order_qty),
    units_per_carton: r4e2Num_(l.units_per_carton), carton_qty: r4e2Num_(l.carton_qty),
    allocation_method: r4e2Str_(l.allocation_method), line_status: r4e2Str_(l.line_status),
    user_edited: (r4e2Str_(l.user_edited).toLowerCase() === 'true') };
}
function recGenActiveHeadersForSku_(headerRows, scope, sku, planningCycle) {
  var lc = function (v) { return r4e2Str_(v).toLowerCase(); };
  var out = [];
  for (var i = 0; i < (headerRows || []).length; i++) {
    var h = headerRows[i];
    if (lc(h.company) !== lc(scope.company) || lc(h.country) !== lc(scope.country) || lc(h.marketplace) !== lc(scope.marketplace) || lc(h.sku) !== lc(sku)) continue;
    if (planningCycle && r4e2Str_(h.planning_cycle) !== planningCycle) continue;
    var st = lc(h.status);
    if (st !== 'draft' && st !== 'site_confirmed') continue;   // active only
    out.push(h);
  }
  return out;
}
function recGenLinesForDraft_(lineRows, draftId) {
  var order = { T1: 1, T2: 2, T3: 3 }, lines = [];
  for (var j = 0; j < (lineRows || []).length; j++) {
    var l = lineRows[j];
    if (r4e2Str_(l.request_allocation_draft_id) !== draftId) continue;
    var bucket = r4e2Str_(l.request_bucket);
    if (!order[bucket]) continue;   // T1/T2/T3 only (T4 never persisted)
    lines.push(recGenReadbackLineDto_(l));
  }
  lines.sort(function (a, b) { return order[a.request_bucket] - order[b.request_bucket]; });
  return lines;
}
function recGenHeaderDto_(h, scope, sku) {
  return { request_allocation_draft_id: r4e2Str_(h.request_allocation_draft_id), planning_cycle: r4e2Str_(h.planning_cycle),
    company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku, status: r4e2Str_(h.status),
    calculation_run_id: r4e2Str_(h.calculation_run_id), formula_version: r4e2Str_(h.formula_version),
    source_data_as_of: r4e2Str_(h.source_data_as_of), draft_version: r4e2Num_(h.draft_version) };
}
// F1-4B-FM6-R4E5B §14/§18/§20 — SKUs whose allocation for this scope(+cycle) is TERMINAL `submitted` (already
// executed into a Request Order). Reported so the client can EXCLUDE them from a new Send (re-send safety) and show
// them as executed — WITHOUT keeping a submitted draft artificially active (getActive active set is unchanged).
function recGenSubmittedSkusForScope_(headerRows, scope, planningCycle) {
  var lc = function (v) { return r4e2Str_(v).toLowerCase(); }, seen = {}, out = [];
  for (var i = 0; i < (headerRows || []).length; i++) {
    var h = headerRows[i];
    if (lc(h.company) !== lc(scope.company) || lc(h.country) !== lc(scope.country) || lc(h.marketplace) !== lc(scope.marketplace)) continue;
    if (planningCycle && r4e2Str_(h.planning_cycle) !== planningCycle) continue;
    if (lc(h.status) !== 'submitted') continue;
    var sku = r4e2Str_(h.sku); if (sku && !seen[sku]) { seen[sku] = 1; out.push(sku); }
  }
  out.sort();
  return out;
}
// PURE: scope-level read-back over eligible SKUs → { drafts:[{header,lines}], conflicts:[{sku,conflictIds}],
// noDraftSkus:[], submittedSkus:[] }. Distinguishes PERSISTED (1 active) / NO_DRAFT (0) / BLOCKED_CONFLICT (>1) per
// SKU. Sorted SKU ASC (§18). submittedSkus is additive (existing consumers ignore it).
function recGenBuildScopeReadback_(headerRows, lineRows, eligibleSkus, scope, planningCycle) {
  var drafts = [], conflicts = [], noDraftSkus = [];
  var submittedSkus = recGenSubmittedSkusForScope_(headerRows, scope, planningCycle);
  var submittedSet = {}; submittedSkus.forEach(function (s) { submittedSet[String(s).toLowerCase()] = 1; });
  for (var i = 0; i < (eligibleSkus || []).length; i++) {
    var sku = eligibleSkus[i];
    var hs = recGenActiveHeadersForSku_(headerRows, scope, sku, planningCycle);
    if (hs.length === 0) { if (!submittedSet[String(sku).toLowerCase()]) noDraftSkus.push(sku); continue; }   // already-executed ≠ never-planned
    if (hs.length > 1) { conflicts.push({ sku: sku, conflictIds: hs.map(function (h) { return r4e2Str_(h.request_allocation_draft_id); }) }); continue; }
    var h = hs[0];
    drafts.push({ header: recGenHeaderDto_(h, scope, sku), lines: recGenLinesForDraft_(lineRows, r4e2Str_(h.request_allocation_draft_id)) });
  }
  drafts.sort(function (a, b) { return a.header.sku < b.header.sku ? -1 : (a.header.sku > b.header.sku ? 1 : 0); });
  return { scope: scope, drafts: drafts, conflicts: conflicts, noDraftSkus: noDraftSkus, submittedSkus: submittedSkus };
}
// __GAPDRAFT_PURE_END__

// BACKEND-ONLY per-SKU compact generator (used by the resumable scope job, R4E2-B2). Builds the gap-backed body and
// persists via the locked plain-result core, returning a COMPACT outcome. opts.skipSchemaValidation lets the job
// validate the authorized schemas ONCE per continuation. NO KMSF, NO gap recompute, NO factory reallocation.
function recGenGenerateOneSkuCompact_(scope1, gapRow, upc, opts) {
  var b = recGenBuildGapDraftBody_(scope1, gapRow, upc, opts);
  if (!b.ok) return { sku: scope1.sku, status: 'NOT_READY', code: b.reason };
  var res = rpoGenerateRecommendationDraftLockedResult_(b.body, { skipSchemaValidation: !!(opts && opts.skipSchemaValidation === true) });
  return recGenSummarizeDraftResult_(scope1.sku, res);
}

// BACKEND-ONLY gap-backed MONTHLY_ORDER draft generation. Reads the STORED order_planning_gap row for the exact
// scope (READ ONLY, verbatim), enforces the §6 readiness gates (durable gap-job DONE/absent + row READY + valid
// tier months + calc timestamp), reads the canonical sku_details UPC, and PERSISTS via the existing locked writer
// by injecting body.facts. NO KMSF, NO gap recalculation, NO factory reallocation, NO frontend wiring. Fails closed.
// mode defaults to MANUAL_REGENERATE so a re-run refreshes recommended_qty from the latest gap (SCHEDULED_REFRESH
// holds recommended_qty immutable within a draft_version) — a manually edited order_qty is still preserved by the
// existing user-edit protection (preserveUserQty), and a regenerate over user edits requires explicit confirmation.
function handleGenerateRequestOrderDraftFromGap_(body) {
  var body0 = (body && body.payload) || body || {};   // accept {payload:{...}} (adapter convention) or flat
  var scope = body0.scope || body0;
  var company = r4e2Str_(scope.company), country = r4e2Str_(scope.country),
      marketplace = r4e2Str_(scope.marketplace), sku = r4e2Str_(scope.sku);
  if (!company || !country || !marketplace || !sku) {
    return jsonResponse_({ success: false, error: 'INVALID_SCOPE', message: 'company + country + marketplace + sku required' });
  }
  // §6 gate #1 — the durable gap-materialization job must be terminal-DONE (or absent = a complete cycle); never
  // consume a partially-refreshed gap table from an in-flight / failed job (parity with runRecommendationGeneration).
  var jobReady = recGenGapReadyFromState_(recGenReadGapJobState_('ORDER_PLANNING'));
  if (!jobReady.ready) {
    return jsonResponse_({ success: false, error: 'ORDER_PLANNING_GAP_NOT_READY', reason: 'GAP_JOB_' + jobReady.status });
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var read = gapReadScopeRows_({ scope: { company: company, country: country, marketplace: marketplace, sku: sku } },
    null, { product: 'ORDER_PLANNING', table: OP_GAP_TABLE_, headers: OP_GAP_HEADERS_ });   // stored row, verbatim
  if (!read || read.success !== true) {
    return jsonResponse_({ success: false, error: 'ORDER_PLANNING_GAP_NOT_READY', reason: (read && read.errors && read.errors[0] && read.errors[0].code) || 'GAP_READ_FAILED' });
  }
  var rows = (read.data && read.data.rows) || [];
  var gapRow = rows.length ? rows[0] : null;
  var upc = recGenUpcBySku_(ss)[sku];                                                        // single canonical UPC authority (sku_details)
  // §6 durable binding (strongest available): bind the draft to the gap generation via the row's calculated_at —
  // no per-row gap runId exists (documented limitation; not solved with a schema change this round). formula_version
  // ('ORDER_PLANNING_GAP') marks the gap-backed authority path so the draft is distinguishable from a KMSF-computed one.
  var b = recGenBuildGapDraftBody_({ company: company, country: country, marketplace: marketplace, sku: sku }, gapRow, upc, {
    mode: body0.mode, planningCycle: body0.planningCycle, draft_purpose: body0.draft_purpose,
    confirmRegenerateOverUserEdits: body0.confirmRegenerateOverUserEdits === true, actor: body0.actor || body0.updated_by });
  if (!b.ok) { return jsonResponse_({ success: false, error: b.reason || 'ORDER_PLANNING_GAP_NOT_READY' }); }
  return jsonResponse_(rpoGenerateRecommendationDraftLockedResult_(b.body));   // existing locked persister (KMPW/KMPR); body.facts short-circuits KMSF
}

// §10/§17 BACKEND-ONLY read-back over request_order_allocation_drafts / _lines VERBATIM (header-mapped). Read-only;
// never creates a sheet. SKU PRESENT → the single active draft (R4E2 one-SKU DTO, unchanged, backward compatible).
// SKU OMITTED → SCOPE-LEVEL: enumerate eligible READY-gap SKUs and classify each as PERSISTED / NO_DRAFT /
// BLOCKED_CONFLICT — one request returns the whole Order Allocation grid for the future R4E3 UI. ACTIVE = draft|site_confirmed.
function handleGetActiveRequestOrderDraftReadback_(body) {
  try {
    var b0 = (body && body.payload) || body || {};   // accept {payload:{scope}} (adapter convention) or flat {scope}
    var scope = b0.scope || b0;
    var company = r4e2Str_(scope.company), country = r4e2Str_(scope.country),
        marketplace = r4e2Str_(scope.marketplace), sku = r4e2Str_(scope.sku),
        planningCycle = r4e2Str_(scope.planningCycle || b0.planningCycle);
    if (!company || !country || !marketplace) {
      return jsonResponse_({ success: false, error: 'INVALID_SCOPE', message: 'company + country + marketplace required' });
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var scope3 = { company: company, country: country, marketplace: marketplace };
    var headerRows = gapReadObjects_(ss, 'request_order_allocation_drafts');   // [] when absent
    var lineRows = gapReadObjects_(ss, 'request_order_allocation_draft_lines');
    if (sku) {   // one-SKU (backward compatible with R4E2)
      var hs = recGenActiveHeadersForSku_(headerRows, scope3, sku, planningCycle);
      if (hs.length === 0) return jsonResponse_({ success: true, data: { status: 'NO_ACTIVE_DRAFT', header: null, lines: [] } });
      if (hs.length > 1) return jsonResponse_({ success: true, data: { status: 'BLOCKED_CONFLICT', header: null, lines: [], conflictIds: hs.map(function (h) { return r4e2Str_(h.request_allocation_draft_id); }) } });
      var h0 = hs[0];
      return jsonResponse_({ success: true, data: { status: 'ACTIVE_DRAFT_FOUND',
        header: recGenHeaderDto_(h0, scope3, sku), lines: recGenLinesForDraft_(lineRows, r4e2Str_(h0.request_allocation_draft_id)) } });
    }
    // scope-level read-back — eligibility = READY order_planning_gap rows for the scope (deterministic SKU ASC).
    var eligible = recGenEnumerateEligibleGapRows_(gapReadObjects_(ss, OP_GAP_TABLE_), scope3).map(function (e) { return e.sku; });
    var rb = recGenBuildScopeReadback_(headerRows, lineRows, eligible, scope3, planningCycle);
    return jsonResponse_({ success: true, data: { status: 'SCOPE_READBACK', scope: scope3, total: eligible.length,
      drafts: rb.drafts, conflicts: rb.conflicts, noDraftSkus: rb.noDraftSkus } });
  } catch (e) {
    return jsonResponse_({ success: false, error: 'READBACK_ERROR', message: String(e && e.message ? e.message : e) });
  }
}
