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
// __GAPDRAFT_PURE_END__

// BACKEND-ONLY gap-backed MONTHLY_ORDER draft generation. Reads the STORED order_planning_gap row for the exact
// scope (READ ONLY, verbatim), enforces the §6 readiness gates (durable gap-job DONE/absent + row READY + valid
// tier months + calc timestamp), reads the canonical sku_details UPC, and PERSISTS via the existing locked writer
// by injecting body.facts. NO KMSF, NO gap recalculation, NO factory reallocation, NO frontend wiring. Fails closed.
// mode defaults to MANUAL_REGENERATE so a re-run refreshes recommended_qty from the latest gap (SCHEDULED_REFRESH
// holds recommended_qty immutable within a draft_version) — a manually edited order_qty is still preserved by the
// existing user-edit protection (preserveUserQty), and a regenerate over user edits requires explicit confirmation.
function handleGenerateRequestOrderDraftFromGap_(body) {
  var scope = (body && body.scope) || body || {};
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
  var built = recGenMapGapRowToFacts_(gapRow, upc);
  if (!built.ready) { return jsonResponse_({ success: false, error: built.reason || 'ORDER_PLANNING_GAP_NOT_READY' }); }
  // §6 durable binding (strongest available): bind the draft to the gap generation via the row's calculated_at —
  // no per-row gap runId exists (documented limitation; not solved with a schema change this round). formula_version
  // marks the gap-backed authority path so the draft is distinguishable from a KMSF-computed one.
  var sourceCalculatedAt = r4e2Str_(gapRow.calculated_at) || r4e2Str_(gapRow.updated_at);
  var genBody = {
    recommendationType: 'MONTHLY_ORDER',
    mode: (body && body.mode) || 'MANUAL_REGENERATE',
    planningCycle: (body && body.planningCycle) || r4e2Str_(gapRow.calculation_month) || '',
    businessScope: { company: company, country: country, marketplace: marketplace, sku: sku,
      draft_purpose: (body && body.draft_purpose) || 'regular' },
    confirmRegenerateOverUserEdits: !!(body && body.confirmRegenerateOverUserEdits === true),
    actor: (body && (body.actor || body.updated_by)) || 'system',
    facts: { lines: built.lines, ready: true, formulaVersion: 'ORDER_PLANNING_GAP', sourceDataAsOf: sourceCalculatedAt }
  };
  return handleGenerateRecommendationDraftLocked_(genBody);   // existing locked persister (KMPW/KMPR); body.facts short-circuits KMSF
}

// §10 BACKEND-ONLY read-back: return the single ACTIVE Request Order draft (header + T1/T2/T3 lines) for the scope,
// reading request_order_allocation_drafts / _lines VERBATIM (header-mapped). ACTIVE = draft | site_confirmed. This is
// the canonical read the NEXT (UI) round will call; NO frontend is wired here. Read-only: never creates a sheet.
function handleGetActiveRequestOrderDraftReadback_(body) {
  try {
    var scope = (body && body.scope) || body || {};
    var company = r4e2Str_(scope.company), country = r4e2Str_(scope.country),
        marketplace = r4e2Str_(scope.marketplace), sku = r4e2Str_(scope.sku),
        planningCycle = r4e2Str_(scope.planningCycle || (body && body.planningCycle));
    if (!company || !country || !marketplace || !sku) {
      return jsonResponse_({ success: false, error: 'INVALID_SCOPE', message: 'company + country + marketplace + sku required' });
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var lc = function (v) { return r4e2Str_(v).toLowerCase(); };
    var headers = gapReadObjects_(ss, 'request_order_allocation_drafts');   // [] when absent → NO_ACTIVE_DRAFT
    var actives = [];
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      if (lc(h.company) !== lc(company) || lc(h.country) !== lc(country) || lc(h.marketplace) !== lc(marketplace) || lc(h.sku) !== lc(sku)) continue;
      if (planningCycle && r4e2Str_(h.planning_cycle) !== planningCycle) continue;
      var st = lc(h.status);
      if (st !== 'draft' && st !== 'site_confirmed') continue;   // active only
      actives.push(h);
    }
    if (!actives.length) return jsonResponse_({ success: true, data: { status: 'NO_ACTIVE_DRAFT', header: null, lines: [] } });
    if (actives.length > 1) {
      return jsonResponse_({ success: true, data: { status: 'BLOCKED_CONFLICT', header: null, lines: [],
        conflictIds: actives.map(function (a) { return r4e2Str_(a.request_allocation_draft_id); }) } });
    }
    var draft = actives[0], draftId = r4e2Str_(draft.request_allocation_draft_id);
    var order = { T1: 1, T2: 2, T3: 3 };
    var allLines = gapReadObjects_(ss, 'request_order_allocation_draft_lines');
    var lines = [];
    for (var j = 0; j < allLines.length; j++) {
      var l = allLines[j];
      if (r4e2Str_(l.request_allocation_draft_id) !== draftId) continue;
      var bucket = r4e2Str_(l.request_bucket);
      if (!order[bucket]) continue;   // T1/T2/T3 only (T4 is never persisted)
      lines.push({
        request_month: r4e2Str_(l.request_month), request_bucket: bucket,
        calculated_gap_qty_snapshot: r4e2Num_(l.calculated_gap_qty_snapshot),
        recommended_qty: r4e2Num_(l.recommended_qty), order_qty: r4e2Num_(l.order_qty),
        units_per_carton: r4e2Num_(l.units_per_carton), carton_qty: r4e2Num_(l.carton_qty),
        allocation_method: r4e2Str_(l.allocation_method), line_status: r4e2Str_(l.line_status),
        user_edited: (r4e2Str_(l.user_edited).toLowerCase() === 'true')
      });
    }
    lines.sort(function (a, b) { return order[a.request_bucket] - order[b.request_bucket]; });
    return jsonResponse_({ success: true, data: {
      status: 'ACTIVE_DRAFT_FOUND',
      header: { request_allocation_draft_id: draftId, planning_cycle: r4e2Str_(draft.planning_cycle),
        company: company, country: country, marketplace: marketplace, sku: sku, status: r4e2Str_(draft.status),
        calculation_run_id: r4e2Str_(draft.calculation_run_id), formula_version: r4e2Str_(draft.formula_version),
        source_data_as_of: r4e2Str_(draft.source_data_as_of), draft_version: r4e2Num_(draft.draft_version) },
      lines: lines
    } });
  } catch (e) {
    return jsonResponse_({ success: false, error: 'READBACK_ERROR', message: String(e && e.message ? e.message : e) });
  }
}
